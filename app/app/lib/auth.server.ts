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
import { appCredentials, ensureStore, SHOP_DOMAIN } from './shopify.server.ts';

export interface RequestShop {
  shop: string;
  /** The verified ID token, when the request carried one. */
  idToken: string | null;
  /** How the request was let in. */
  via: 'token' | 'dev';
}

const bearer = (request: Request): string | null => {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() || null : null;
};

const isDocumentRequest = (request: Request): boolean =>
  request.method === 'GET' &&
  (request.headers.get('sec-fetch-dest') === 'document' ||
    (request.headers.get('accept') ?? '').includes('text/html'));

/**
 * Resolves the store a request acts on, or refuses it.
 *
 * Throws a Response: a redirect to the bounce page for a token-less document
 * request from the admin, 401 otherwise. Callers just `await` it.
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

  const token = bearer(request) ?? url.searchParams.get('id_token');
  const credentials = await appCredentials();
  if (!credentials) {
    throw new Response('O app não tem SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET configurados.', { status: 500 });
  }

  if (!token) {
    if (isDocumentRequest(request) && url.pathname !== '/bounce') {
      // Inside the admin, App Bridge can mint a token; send the request
      // through the bounce page and come back with it.
      const back = new URL(url);
      back.searchParams.delete('id_token');
      throw redirect(`/bounce?to=${encodeURIComponent(back.pathname + back.search)}`);
    }
    throw new Response('Abra o D&VFly pelo admin da Shopify (sem ID token).', { status: 401 });
  }

  try {
    const session = verifySessionToken(token, credentials);
    return { shop: session.shop, idToken: token, via: 'token' };
  } catch (error) {
    const reason = error instanceof SessionTokenError ? error.reason : 'desconhecido';
    if (isDocumentRequest(request) && url.pathname !== '/bounce' && reason === 'expirado') {
      const back = new URL(url);
      back.searchParams.delete('id_token');
      throw redirect(`/bounce?to=${encodeURIComponent(back.pathname + back.search)}`);
    }
    throw new Response(`ID token recusado (${reason}).`, {
      status: 401,
      // Tells App Bridge's fetch interceptor to retry with a fresh token.
      headers: { 'X-Shopify-Retry-Invalid-Session-Request': '1' },
    });
  }
}

/**
 * The store behind a verified request — installing it on first contact.
 *
 * With an ID token and no usable credential for that shop, the token is
 * exchanged for an offline access token and the row is created (or refreshed:
 * a reinstall gets a new token). In development without tokens, falls back to
 * registering an own-organization store with client credentials.
 */
export async function installStore(request: RequestShop): Promise<StoreRow | null> {
  if (!SHOP_DOMAIN.test(request.shop)) return null;
  const domain = request.shop.toLowerCase();
  const existing = await db.store.findUnique({ where: { domain } });

  if (!request.idToken) return existing ?? ensureStore(domain);

  const usable = existing && !existing.uninstalledAt && (existing.accessToken || (existing.clientId && existing.clientSecret));
  if (usable) return existing;

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

  return db.store.upsert({
    where: { domain },
    create: {
      domain,
      label,
      accessToken: token.accessToken,
      scopes: token.scope,
      installedAt: new Date(),
      isProduction: true,
    },
    update: {
      label,
      accessToken: token.accessToken,
      scopes: token.scope,
      installedAt: new Date(),
      uninstalledAt: null,
    },
  });
}
