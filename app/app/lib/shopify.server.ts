/**
 * Bridges the app to the Shopify packages.
 *
 * One running app publishes to several stores (docs/ARQUITETURA.md 2.5). The
 * client for each store is kept for the life of the process, so its access
 * token is minted once and reused across requests instead of once per save,
 * publish or bulk row.
 *
 * Two kinds of store credential live side by side (see schema.prisma):
 * the offline token a store got when it INSTALLED the app (any store), and
 * the app's own client id/secret (stores of our own organization, the way
 * the first stores were registered).
 */
import type { Store as StoreRow } from '@prisma/client';

import { ShopifyClient } from '../../../packages/shopify/src/client.ts';
import type { Store } from '../../../packages/shopify/src/deploy.ts';

import { config } from './config.server.ts';
import { db } from './db.server.ts';

export {
  deployPage,
  deployProductPage,
  formatDeployResult,
  ProductionNotAllowedError,
} from '../../../packages/shopify/src/deploy.ts';
export { ShopifyClient } from '../../../packages/shopify/src/client.ts';
export { updatePage } from '../../../packages/shopify/src/pages.ts';
export { productSuffix, removeProductTemplate, SOLO_SUFFIX } from '../../../packages/shopify/src/templates.ts';

/** A myshopify domain and nothing else — this value ends up in URLs and a CSP. */
export const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

/**
 * The app's own credentials — one pair for the whole app, whatever the store.
 * Environment first; failing that (development only), a pair a store row
 * still carries from the days credentials were copied per store.
 */
export async function appCredentials(): Promise<{ clientId: string; clientSecret: string } | null> {
  if (config.shopifyClientId && config.shopifyClientSecret) {
    return { clientId: config.shopifyClientId, clientSecret: config.shopifyClientSecret };
  }
  if (config.isProduction) return null;
  const any = await db.store.findFirst({
    where: { clientId: { not: null }, clientSecret: { not: null } },
    orderBy: { createdAt: 'asc' },
  });
  return any?.clientId && any.clientSecret ? { clientId: any.clientId, clientSecret: any.clientSecret } : null;
}

/**
 * Registers a store of the app's OWN organization with the client
 * credentials grant — the development path, used when no ID token is in play
 * (`DVFLY_AUTH=off`). Any other store installs the app instead (auth.server).
 *
 * The credentials are proven against the shop before the row is written, so a
 * store never registers half-working. New stores default to `isProduction`,
 * which means publishing to them demands the explicit extra confirmation in
 * the editor; promoting a store to "test" is a deliberate database-side act.
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

/** True when the app can still act on this store. */
export function storeUsable(row: StoreRow): boolean {
  if (row.uninstalledAt) return false;
  if (row.accessToken) return true;
  return Boolean((row.clientId && row.clientSecret) || (config.shopifyClientId && config.shopifyClientSecret));
}

/** Database row to the shape the deploy package expects. */
export function toStore(row: StoreRow): Store {
  return {
    domain: row.domain,
    accessToken: row.accessToken,
    clientId: row.clientId ?? config.shopifyClientId ?? '',
    clientSecret: row.clientSecret ?? config.shopifyClientSecret ?? '',
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
  const key = `${store.domain}|${store.accessToken ?? store.clientId}|${store.apiVersion ?? ''}`;
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
