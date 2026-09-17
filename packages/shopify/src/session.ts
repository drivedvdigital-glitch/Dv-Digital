/**
 * Installation and request authentication for an app any store can install.
 *
 * Three pieces, all pure enough to test without Shopify:
 *   - `verifySessionToken`: the ID token App Bridge hands the embedded app
 *     (a JWT signed with the app's client secret, valid for one minute) is
 *     the proof that a request came from the Shopify admin of a given shop.
 *   - `exchangeToken`: the first time a shop opens the app, that ID token is
 *     traded for an OFFLINE access token — the credential the backend keeps
 *     for that shop (Shopify-managed installation + token exchange).
 *   - `verifyWebhookHmac`: webhooks are signed with the same secret.
 *
 * https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens
 * https://shopify.dev/docs/apps/build/authentication-authorization/implement-token-exchange
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { ShopifyError } from './client.ts';

export interface AppCredentials {
  clientId: string;
  clientSecret: string;
}

export interface SessionClaims {
  /** The shop's myshopify domain, from `dest`. */
  shop: string;
  /** Shopify user id (`sub`), when present. */
  userId: string | null;
  sid: string | null;
  jti: string | null;
  exp: number;
}

export class SessionTokenError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`ID token inválido: ${reason}`);
    this.name = 'SessionTokenError';
    this.reason = reason;
  }
}

const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

/** Seconds of clock difference tolerated between Shopify and this server. */
const CLOCK_SKEW_S = 10;

const b64url = {
  encode: (input: Buffer | string) => Buffer.from(input).toString('base64url'),
  decode: (input: string) => Buffer.from(input, 'base64url'),
};

/**
 * Which of these apps a token SAYS it belongs to.
 *
 * This server answers for more than one Shopify app (custom distribution ties
 * an app to one store, so a second store means a second app), and the signature
 * cannot be checked before knowing WHICH secret to check it against. So `aud`
 * is read here without verifying anything — and that is safe precisely because
 * nothing is decided here: the returned credentials go straight into
 * `verifySessionToken`, which refuses a signature that does not match and
 * checks `aud` again against the credentials it was given. A forged `aud` only
 * picks a secret the forger does not have.
 *
 * With a single app configured, that app is returned and the verification
 * below rejects a token minted for anything else.
 */
export function credentialsFor(token: string, apps: AppCredentials[]): AppCredentials | null {
  if (apps.length <= 1) return apps[0] ?? null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(b64url.decode(parts[1]).toString('utf8'));
    const aud = claims && typeof claims === 'object' ? (claims as { aud?: unknown }).aud : null;
    if (typeof aud !== 'string') return null;
    return apps.find((app) => app.clientId === aud) ?? null;
  } catch {
    return null;
  }
}

/**
 * Verifies an App Bridge ID token: HS256 signature with the client secret,
 * then the claims Shopify says to check — `exp` in the future, `nbf` in the
 * past, `aud` equal to the client id, and `iss`/`dest` on the same shop.
 */
export function verifySessionToken(
  token: string,
  credentials: AppCredentials,
  nowMs = Date.now(),
): SessionClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new SessionTokenError('formato');
  const [head, body, signature] = parts;

  let header: { alg?: string };
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(b64url.decode(head).toString('utf8'));
    claims = JSON.parse(b64url.decode(body).toString('utf8'));
  } catch {
    throw new SessionTokenError('formato');
  }
  // `null` and `[]` parse fine and would only blow up further down.
  if (!header || typeof header !== 'object' || !claims || typeof claims !== 'object') {
    throw new SessionTokenError('formato');
  }
  if (header.alg !== 'HS256') throw new SessionTokenError('algoritmo');

  const expected = createHmac('sha256', credentials.clientSecret).update(`${head}.${body}`).digest();
  const given = b64url.decode(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new SessionTokenError('assinatura');
  }

  const now = nowMs / 1000;
  const exp = Number(claims.exp);
  const nbf = Number(claims.nbf ?? 0);
  if (!Number.isFinite(exp) || exp + CLOCK_SKEW_S < now) throw new SessionTokenError('expirado');
  if (nbf - CLOCK_SKEW_S > now) throw new SessionTokenError('ainda não válido');
  if (claims.aud !== credentials.clientId) throw new SessionTokenError('aud');

  const dest = hostOf(claims.dest);
  const iss = hostOf(claims.iss);
  if (!dest || !SHOP_DOMAIN.test(dest)) throw new SessionTokenError('dest');
  if (iss !== dest) throw new SessionTokenError('iss');

  return {
    shop: dest.toLowerCase(),
    userId: claims.sub === undefined ? null : String(claims.sub),
    sid: typeof claims.sid === 'string' ? claims.sid : null,
    jti: typeof claims.jti === 'string' ? claims.jti : null,
    exp,
  };
}

function hostOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

/** Test helper and dev tool: mints a token Shopify would have signed. */
export function signSessionToken(
  claims: Record<string, unknown>,
  clientSecret: string,
): string {
  const head = b64url.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url.encode(JSON.stringify(claims));
  const signature = createHmac('sha256', clientSecret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${signature}`;
}

export interface ExchangedToken {
  accessToken: string;
  scope: string;
  /** Online tokens expire; offline ones do not (undefined). */
  expiresIn?: number;
}

/**
 * Trades a valid ID token for an access token on that shop. Offline by
 * default: the token the backend stores and reuses for every later request,
 * including ones nobody is looking at (publishing, webhooks).
 */
export async function exchangeToken(
  shop: string,
  idToken: string,
  credentials: AppCredentials,
  kind: 'offline' | 'online' = 'offline',
): Promise<ExchangedToken> {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: idToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
      requested_token_type: `urn:shopify:params:oauth:token-type:${kind}-access-token`,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new ShopifyError(`A Shopify recusou a instalação em ${shop} (HTTP ${response.status})`, {
      status: response.status,
      body: text.slice(0, 500),
    });
  }
  let parsed: { access_token?: string; scope?: string; expires_in?: number };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ShopifyError(`Resposta ilegível da troca de token em ${shop}`, { body: text.slice(0, 200) });
  }
  if (!parsed.access_token) {
    throw new ShopifyError(`Troca de token sem access_token em ${shop}`, { body: text.slice(0, 200) });
  }
  return { accessToken: parsed.access_token, scope: parsed.scope ?? '', expiresIn: parsed.expires_in };
}

/**
 * Webhook signature: base64 HMAC-SHA256 of the RAW body with the client
 * secret. Compared in constant time; a wrong length is simply wrong.
 */
export function verifyWebhookHmac(rawBody: string | Buffer, header: string | null, clientSecret: string): boolean {
  if (!header) return false;
  const expected = createHmac('sha256', clientSecret).update(rawBody).digest();
  let given: Buffer;
  try {
    given = Buffer.from(header, 'base64');
  } catch {
    return false;
  }
  return expected.length === given.length && timingSafeEqual(expected, given);
}
