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
import { exchangeToken, SessionTokenError, verifySessionToken } from '../../../packages/shopify/src/session.ts';

import { config } from './config.server.ts';
import { db } from './db.server.ts';
import { appCredentials, ensureStore, SHOP_DOMAIN, storeUsable } from './shopify.server.ts';

export interface RequestShop {
  shop: string;
  /** The verified ID token, when the request carried one. */
  idToken: string | null;
  /** How the request was let in. */
  via: 'token' | 'dev';
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
  return redirect(`/bounce?to=${encodeURIComponent(back.pathname + back.search)}`);
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
    if (SHOP_DOMAIN.test(asked)) return { shop: asked, idToken: null, via: 'dev' };
    const first = await db.store.findFirst({ orderBy: { createdAt: 'asc' } });
    return { shop: first?.domain ?? '', idToken: null, via: 'dev' };
  }

  const fromHeader = bearer(request);
  const token = fromHeader ?? url.searchParams.get('id_token');
  const credentials = await appCredentials();
  if (!credentials) {
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

  let shop: string;
  try {
    shop = verifySessionToken(token, credentials).shop;
  } catch (error) {
    const reason = error instanceof SessionTokenError ? error.reason : 'desconhecido';
    // Whatever went wrong with a token that came in the URL (expired, secret
    // rotated since it was minted), a new one from App Bridge settles it.
    if (!fromHeader && canBounce) throw bounceTo(url);
    throw new Response(`ID token recusado (${reason}).`, {
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
  return { shop, idToken: token, via: 'token' };
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
  const existing = await db.store.findUnique({ where: { domain } });

  if (!request.idToken) return existing ?? ensureStore(domain);

  const expiringSoon =
    existing?.accessToken &&
    existing.tokenExpiresAt &&
    existing.tokenExpiresAt.getTime() - Date.now() < RENEW_BEFORE_MS;
  if (existing && storeUsable(existing) && !expiringSoon) return existing;

  const credentials = await appCredentials();
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
      accessToken: token.accessToken,
      tokenExpiresAt,
      scopes: token.scope,
      installedAt: new Date(),
      isProduction: true,
    },
    update: {
      label,
      accessToken: token.accessToken,
      tokenExpiresAt,
      scopes: token.scope,
      installedAt: new Date(),
      uninstalledAt: null,
    },
  });
}
