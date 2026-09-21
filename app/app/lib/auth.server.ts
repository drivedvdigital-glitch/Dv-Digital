/**
 * Who is asking, and on behalf of which store.
 *
 * Embedded in the Shopify admin, every request the app receives carries an
 * ID token: on data requests as `Authorization: Bearer …` (App Bridge adds
 * it to `fetch`), on the first document load as `?id_token=`. `requireShop`
 * verifies it and answers with the shop. A document request that arrives
 * without one (a reload inside the admin, a link opened elsewhere) is sent
 * through the bounce page, which asks App Bridge for a token and comes back.
 *
 * The first verified request from a store that has no access token yet is
 * the installation: the ID token is exchanged for an offline token and the
 * store registers itself. No settings screen, no OAuth redirect dance —
 * Shopify-managed installation.
 */
import type { Store as StoreRow } from '@prisma/client';
import { redirect } from 'react-router';

import { ShopifyClient } from '../../../packages/shopify/src/client.ts';
import {
  audienceOf,
  credentialsFor,
  exchangeToken,
  SessionTokenError,
  verifySessionToken,
} from '../../../packages/shopify/src/session.ts';

import { storeUnlocked, UNLOCK_PATH } from './access.server.ts';
import { config } from './config.server.ts';
import { db } from './db.server.ts';
import { rememberRefusal } from './refusals.server.ts';
import { seal } from './secrets.server.ts';
import { appCredentials, appCredentialsList, ensureStore, SHOP_DOMAIN, storeUsable } from './shopify.server.ts';
import { secretFingerprint, tokenRefusalMessage } from './token-refusal.ts';

export interface RequestShop {
  shop: string;
  /** The verified ID token, when the request carried one. */
  idToken: string | null;
  /** How the request was let in. */
  via: 'token' | 'dev';
  /**
   * The Shopify app whose secret verified this token. The server answers for
   * more than one (a second store of yours needs a second custom app), and
   * everything downstream — the token exchange, the store row — has to use the
   * same one, not "the first configured".
   */
  appClientId: string | null;
}

/** The bounce page marks the request it sends back, so a refusal after it never bounces again. */
export const BOUNCED_PARAM = 'dv_bounced';

const bearer = (request: Request): string | null => {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() || null : null;
};

const isDocumentRequest = (request: Request): boolean =>
  request.method === 'GET' &&
  (request.headers.get('sec-fetch-dest') === 'document' ||
    (request.headers.get('accept') ?? '').includes('text/html'));

/** Renew an expiring access token this long before it dies. */
const RENEW_BEFORE_MS = 60 * 60 * 1000;

const bounceTo = (url: URL): Response => {
  const back = new URL(url);
  back.searchParams.delete('id_token');
  back.searchParams.delete(BOUNCED_PARAM);
  const bounce = new URL('/bounce', url.origin);
  bounce.searchParams.set('to', back.pathname + back.search);
  // `shop` and `host` ride on the bounce's OWN url, not only inside `to`.
  //
  // App Bridge reads its configuration from the page's query string (and from
  // meta tags), and it REFUSES to start without `shop`: "missing required
  // configuration fields: shop". Buried inside an encoded `to`, it may as well
  // not be there — the script aborts, `window.shopify` never exists, and the
  // page reports that the Shopify script did not load. It loads; it just has
  // nothing to work with.
  for (const chave of ['shop', 'host', 'embedded', 'locale']) {
    const valor = url.searchParams.get(chave);
    if (valor) bounce.searchParams.set(chave, valor);
  }
  return redirect(bounce.pathname + bounce.search);
};

/**
 * Resolves the store a request acts on, or refuses it.
 *
 * Throws a Response: a redirect to the bounce page for a document request
 * from the admin whose URL token is missing or no longer good, 401
 * otherwise. Callers just `await` it.
 */
export async function requireShop(request: Request): Promise<RequestShop> {
  const url = new URL(request.url);

  if (!config.authRequired) {
    // Development without the admin: the shop is whatever the URL says, or
    // the first registered store.
    const asked = url.searchParams.get('shop')?.toLowerCase() ?? '';
    if (SHOP_DOMAIN.test(asked)) return { shop: asked, idToken: null, via: 'dev', appClientId: null };
    const first = await db.store.findFirst({ orderBy: { createdAt: 'asc' } });
    return { shop: first?.domain ?? '', idToken: null, via: 'dev', appClientId: first?.clientId ?? null };
  }

  const fromHeader = bearer(request);
  const token = fromHeader ?? url.searchParams.get('id_token');
  const apps = await appCredentialsList();
  if (apps.length === 0) {
    throw new Response('O app não tem SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET configurados.', { status: 500 });
  }
  // A document request can always fetch itself a fresh token through the
  // bounce — unless it just came from there, in which case the refusal is
  // real and is shown, not looped.
  const canBounce =
    isDocumentRequest(request) && url.pathname !== '/bounce' && url.searchParams.get(BOUNCED_PARAM) !== '1';

  if (!token) {
    if (canBounce) throw bounceTo(url);
    throw new Response('Abra o D&VFly pelo admin da Shopify (sem ID token).', { status: 401 });
  }

  // WHICH app this token is for is read from its `aud` before anything is
  // trusted — see credentialsFor: the choice only decides which secret the
  // signature is checked against, and a token minted for an app this server
  // does not hold finds no credentials at all.
  const credentials = credentialsFor(token, apps);
  let shop: string;
  try {
    if (!credentials) throw new SessionTokenError('aud');
    shop = verifySessionToken(token, credentials).shop;
  } catch (error) {
    const reason = error instanceof SessionTokenError ? error.reason : 'desconhecido';
    // WHICH key was in memory when this failed, in the server's own log.
    //
    // "I already changed the key" and "the key here is still the old one" look
    // the same from outside, and the file on disk is not proof: the process
    // read it when it started. Four characters, next to the app the token came
    // from, settle it at the exact moment of the failure. Log only — the
    // refusal page is public.
    const aud = audienceOf(token);
    console.warn(
      `[dvfly] ID token recusado (${reason}) — app ${aud ?? '?'}, ` +
        `segredo conferido termina em ...${secretFingerprint(credentials?.clientSecret)}`,
    );
    // Guardado em memória por meia hora: é contra ESTE token, que a Shopify
    // assinou de verdade, que /api/chave diz se a chave colada está certa —
    // sem instalar nada e sem mais uma volta pelo admin.
    //
    // O índice é o app que ESTE servidor resolveu (`credentials`), nunca o
    // `aud` que o token declara: este caminho é aberto à internet, e aceitar a
    // palavra do token deixaria qualquer um escolher quantas lembranças reais
    // cabem. Sem credencial não há chave para testar contra, então não há o que
    // lembrar.
    if (credentials) rememberRefusal(token, credentials.clientId, Date.now());
    // Whatever went wrong with a token that came in the URL (expired, secret
    // rotated since it was minted), a new one from App Bridge settles it.
    if (!fromHeader && canBounce) throw bounceTo(url);
    throw new Response(tokenRefusalMessage(reason, aud, apps.map((app) => app.clientId)), {
      status: 401,
      // Tells App Bridge's fetch interceptor to retry with a fresh token.
      headers: { 'X-Shopify-Retry-Invalid-Session-Request': '1' },
    });
  }

  if (config.allowedShops.length > 0 && !config.allowedShops.includes(shop)) {
    throw new Response(
      `A loja ${shop} não está na lista de lojas permitidas deste app (DVFLY_ALLOWED_SHOPS).`,
      { status: 403 },
    );
  }

  // The lock. It sits HERE, and not on each screen, because this function is
  // the one door every screen and every data route already goes through — a
  // gate anywhere else is a gate somebody forgets to put on the next route.
  // The unlock page itself is the one exception, and it is named, not guessed.
  if (url.pathname !== UNLOCK_PATH && !(await storeUnlocked(shop))) {
    if (isDocumentRequest(request)) {
      const back = new URL(url);
      back.searchParams.delete('id_token');
      back.searchParams.delete(BOUNCED_PARAM);
      const unlock = new URL(UNLOCK_PATH, url.origin);
      unlock.searchParams.set('to', back.pathname + back.search);
      // The token this request ALREADY carried in its URL rides along.
      //
      // The first version dropped it, so that no ID token was written into a
      // redirect of ours, and let the unlock page fetch a fresh one through the
      // bounce. That hop depends on App Bridge answering inside the admin — and
      // in a real store, in a browser with shields on, it did not: the merchant
      // got the bounce's fallback text instead of the screen. The exposure is
      // the same either way (this is the very URL the admin just opened), and
      // one less moving part is one less way to be locked out of the lock.
      const carried = url.searchParams.get('id_token');
      if (carried) unlock.searchParams.set('id_token', carried);
      throw redirect(unlock.pathname + unlock.search);
    }
    throw new Response(
      `Esta loja (${shop}) ainda não foi liberada. Abra o app pelo admin e digite a senha de acesso.`,
      { status: 403 },
    );
  }

  return { shop, idToken: token, via: 'token', appClientId: credentials.clientId };
}

/**
 * The store behind a verified request — installing it on first contact.
 *
 * With an ID token and no usable credential for that shop, the token is
 * exchanged for an offline access token and the row is created (or refreshed:
 * a reinstall gets a new token, and so does a token about to expire). In
 * development without tokens, falls back to registering an own-organization
 * store with client credentials.
 */
export async function installStore(request: RequestShop): Promise<StoreRow | null> {
  if (!SHOP_DOMAIN.test(request.shop)) return null;
  const domain = request.shop.toLowerCase();
  let existing = await db.store.findUnique({ where: { domain } });

  // A row the LOCK created carries the column's default, `isProduction` false.
  //
  // The unlock happens before the install — the gate stops the very request
  // that would have created the row — so every store that came in through the
  // access key was filed as "not production": no badge next to its name, and
  // none of the care that mark buys it. The first store, registered before the
  // lock existed, took the create path and looked right, which is why this hid
  // in plain sight. Nothing in this app ever registers a store that is NOT
  // production, so the repair needs no condition beyond the mark itself.
  if (existing && !existing.isProduction) {
    existing = await db.store.update({ where: { id: existing.id }, data: { isProduction: true } });
  }

  if (!request.idToken) return existing ?? ensureStore(domain);

  const expiringSoon =
    existing?.accessToken &&
    existing.tokenExpiresAt &&
    existing.tokenExpiresAt.getTime() - Date.now() < RENEW_BEFORE_MS;
  if (existing && storeUsable(existing) && !expiringSoon) return existing;

  // The same app that verified the token does the exchange: another app's
  // secret would simply be refused by Shopify, and the store would be left
  // installed-but-unusable with no explanation.
  const credentials = await appCredentials(request.appClientId ?? existing?.clientId ?? null);
  if (!credentials) return null;
  const token = await exchangeToken(domain, request.idToken, credentials);
  const client = new ShopifyClient({
    domain,
    accessToken: token.accessToken,
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    apiVersion: config.shopifyApiVersion,
  });
  const label = await client.shopName().catch(() => domain.replace('.myshopify.com', ''));
  const tokenExpiresAt = token.expiresIn ? new Date(Date.now() + token.expiresIn * 1000) : null;

  return db.store.upsert({
    where: { domain },
    create: {
      domain,
      label,
      // Which app this store installed. Not a secret (the client id is public,
      // it goes in every page's meta tag), and without it the server would not
      // know whose credentials to publish with once there is more than one.
      clientId: credentials.clientId,
      accessToken: seal(token.accessToken),
      tokenExpiresAt,
      scopes: token.scope,
      installedAt: new Date(),
      isProduction: true,
    },
    update: {
      label,
      clientId: credentials.clientId,
      accessToken: seal(token.accessToken),
      tokenExpiresAt,
      scopes: token.scope,
      installedAt: new Date(),
      uninstalledAt: null,
      // A real store, exchanging a real token — the same thing `create` says.
      //
      // It was missing here, and the row that reaches this branch is exactly
      // the one the LOCK created: the unlock happens before the install, and
      // it writes the row with the column's default (false). So every store
      // that came in through the access key was filed as "not production" and
      // published without the production guard, while the badge next to it
      // stayed blank. The first store, registered before the lock existed,
      // took the `create` branch and looked right — which is why this hid.
      isProduction: true,
    },
  });
}
