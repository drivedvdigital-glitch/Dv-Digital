/**
 * Bridges the app to the Shopify packages.
 *
 * One running app publishes to several stores (docs/ARQUITETURA.md 2.5). The
 * client for each store is kept for the life of the process, so its access
 * token (24h, client credentials) is minted once and reused across requests
 * instead of once per save, publish or bulk row.
 */
import type { Store as StoreRow } from '@prisma/client';

import { ShopifyClient } from '../../../packages/shopify/src/client.ts';
import type { Store } from '../../../packages/shopify/src/deploy.ts';

import { config } from './config.server.ts';
import { db } from './db.server.ts';

export { deployPage, formatDeployResult, ProductionNotAllowedError } from '../../../packages/shopify/src/deploy.ts';
export { ShopifyClient } from '../../../packages/shopify/src/client.ts';
export { updatePage } from '../../../packages/shopify/src/pages.ts';
export { SOLO_SUFFIX } from '../../../packages/shopify/src/templates.ts';

/** A myshopify domain and nothing else — this value ends up in URLs and a CSP. */
export const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

/**
 * The app's own credentials — every store runs the *same* app, so one
 * client id/secret pair authenticates against any store that installed it
 * (the client credentials grant is per-shop only in the domain it is sent to).
 *
 * Environment first; failing that (development only), any registered store's
 * pair, which by the same-app argument is also the app's pair. This is what
 * lets a fresh install configure itself without a settings screen.
 */
async function appCredentials(): Promise<{ clientId: string; clientSecret: string } | null> {
  if (config.shopifyClientId && config.shopifyClientSecret) {
    return { clientId: config.shopifyClientId, clientSecret: config.shopifyClientSecret };
  }
  if (config.isProduction) return null;
  const any = await db.store.findFirst({ orderBy: { createdAt: 'asc' } });
  return any ? { clientId: any.clientId, clientSecret: any.clientSecret } : null;
}

/**
 * A store that opens the app is a store that gets registered — there is no
 * store registry screen, matching how the reference app behaves: install,
 * open, use.
 *
 * The credentials are proven against the shop before the row is written, so a
 * store never registers half-working. New stores default to `isProduction`,
 * which means publishing to them demands the explicit extra confirmation in
 * the editor; promoting a store to "test" is a deliberate database-side act,
 * not something a page can do by accident.
 */
export async function ensureStore(shop: string): Promise<StoreRow | null> {
  if (!SHOP_DOMAIN.test(shop)) return null;
  const domain = shop.toLowerCase();

  const existing = await db.store.findUnique({ where: { domain } });
  if (existing) return existing;

  const credentials = await appCredentials();
  if (!credentials) return null;

  try {
    const client = new ShopifyClient({ domain, ...credentials, apiVersion: config.shopifyApiVersion });
    const name = await client.shopName();
    return await db.store.create({
      data: { domain, label: name, ...credentials, isProduction: true },
    });
  } catch {
    // Wrong shop or the app is not installed there; nothing to register.
    return null;
  }
}

/** Database row to the shape the deploy package expects. */
export function toStore(row: StoreRow): Store {
  return {
    domain: row.domain,
    clientId: row.clientId,
    clientSecret: row.clientSecret,
    label: row.label,
    isProduction: row.isProduction,
    apiVersion: config.shopifyApiVersion,
  };
}

// Survives Vite's module re-evaluation the same way the Prisma client does.
const globalForClients = globalThis as unknown as { dvflyClients?: Map<string, ShopifyClient> };
const clients = globalForClients.dvflyClients ?? new Map<string, ShopifyClient>();
if (!config.isProduction) globalForClients.dvflyClients = clients;

/** The store's client, reused across requests (and so is its token). */
export function clientForStore(store: Store): ShopifyClient {
  const key = `${store.domain}|${store.clientId}|${store.apiVersion ?? ''}`;
  let client = clients.get(key);
  if (!client) {
    client = new ShopifyClient(store);
    clients.set(key, client);
  }
  return client;
}

export function clientFor(row: StoreRow): ShopifyClient {
  return clientForStore(toStore(row));
}
