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

import { ShopifyClient, ShopifyError } from '../../../packages/shopify/src/client.ts';
import type { Store } from '../../../packages/shopify/src/deploy.ts';
import { credentialsFor } from '../../../packages/shopify/src/session.ts';

import { config } from './config.server.ts';
import { db } from './db.server.ts';
import { open, seal } from './secrets.server.ts';

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

type Credentials = { clientId: string; clientSecret: string };

/**
 * Every Shopify app this server answers for.
 *
 * Usually one. Two when a second store of yours lives in another organization:
 * Shopify's custom distribution ties an app to a single store, so the second
 * store installs a second app, and this server holds both pairs.
 *
 * Environment first; failing that (development only), a pair a store row still
 * carries from the days credentials were copied per store.
 */
export async function appCredentialsList(): Promise<Credentials[]> {
  if (config.shopifyApps.length > 0) return config.shopifyApps;
  if (config.isProduction) return [];
  const rows = await db.store.findMany({
    where: { clientId: { not: null }, clientSecret: { not: null } },
    orderBy: { createdAt: 'asc' },
  });
  const apps: Credentials[] = [];
  for (const row of rows) {
    const clientSecret = open(row.clientSecret);
    if (!row.clientId || !clientSecret) continue;
    if (apps.some((app) => app.clientId === row.clientId)) continue;
    apps.push({ clientId: row.clientId, clientSecret });
  }
  return apps;
}

/**
 * The credentials of ONE app — the one a store belongs to.
 *
 * `clientId` comes from the store's row (written at install) or from the `aud`
 * of the token in hand. Without it, the first app configured answers, which is
 * the right default while there is only one and the honest fallback for a row
 * written before this existed.
 */
export async function appCredentials(clientId?: string | null): Promise<Credentials | null> {
  const apps = await appCredentialsList();
  if (apps.length === 0) return null;
  if (!clientId) return apps[0];
  return apps.find((app) => app.clientId === clientId) ?? apps[0];
}

/** The credentials a store row acts under. */
export async function credentialsForStore(row: Pick<StoreRow, 'clientId' | 'clientSecret'>): Promise<Credentials | null> {
  // A row that carries its own pair (old development rows) keeps deciding for
  // itself; everything else is resolved from the configured apps.
  const ownSecret = open(row.clientSecret);
  if (row.clientId && ownSecret) return { clientId: row.clientId, clientSecret: ownSecret };
  return appCredentials(row.clientId);
}

/**
 * The client id App Bridge must boot with, for THIS request.
 *
 * App Bridge identifies the app to the admin; with two apps on one server,
 * handing a store the other app's id leaves the page unembedded and every
 * `fetch` unsigned — a failure that looks like everything and nothing. Read, in
 * order, from the `aud` of the token in the url (exact, no database), from the
 * store the url names (its row remembers the app it installed), and finally the
 * first app configured, which is the whole truth while there is only one.
 */
export async function clientIdForRequest(request: Request, shopHint?: string): Promise<string> {
  const apps = await appCredentialsList();
  if (apps.length === 0) return '';
  const url = new URL(request.url);
  const token = url.searchParams.get('id_token');
  if (token) {
    const app = credentialsFor(token, apps);
    if (app) return app.clientId;
  }
  const shop = (shopHint ?? url.searchParams.get('shop') ?? '').toLowerCase();
  if (SHOP_DOMAIN.test(shop)) {
    const row = await db.store.findUnique({ where: { domain: shop }, select: { clientId: true } });
    const known = apps.find((app) => app.clientId === row?.clientId);
    if (known) return known.clientId;
  }
  return apps[0].clientId;
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
    // The pair is copied into the row only when the environment does not
    // carry it (a database registered before the app had a .env) — the
    // secret has one home, and it is not the database.
    const fromEnvironment = config.shopifyApps.length > 0;
    return await db.store.create({
      data: {
        domain,
        label: name,
        ...(fromEnvironment
          ? {}
          : { clientId: credentials.clientId, clientSecret: seal(credentials.clientSecret) }),
        isProduction: true,
      },
    });
  } catch {
    // Wrong shop or the app is not installed there; nothing to register.
    return null;
  }
}

/** True when the app can still act on this store. */
export function storeUsable(row: StoreRow): boolean {
  if (row.uninstalledAt) return false;
  if (row.accessToken) return !row.tokenExpiresAt || row.tokenExpiresAt.getTime() > Date.now();
  return Boolean((row.clientId && row.clientSecret) || config.shopifyApps.length > 0);
}

/** Why the store is out of reach, in the words the screen shows. */
export function storeUnusableReason(row: StoreRow): string | null {
  if (row.uninstalledAt) return 'o app foi desinstalado nesta loja — reinstale pela Shopify para voltar a publicar nela';
  if (row.accessToken && row.tokenExpiresAt && row.tokenExpiresAt.getTime() <= Date.now()) {
    return 'o acesso a esta loja expirou — abra o D&VFly pelo admin dela para renovar';
  }
  if (!storeUsable(row)) return 'sem credencial para esta loja';
  return null;
}

/**
 * Database row to the shape the deploy package expects.
 *
 * This is the ONE place a stored credential is opened: everything that talks to
 * Shopify goes through here, so nothing downstream ever sees the sealed form —
 * and nothing downstream can forget to open it.
 */
export function toStore(row: StoreRow): Store {
  // The app this store belongs to — remembered on the row at install. Falling
  // back to the first configured app is right while there is only one, and is
  // what a row written before multiple apps existed deserves.
  const app =
    config.shopifyApps.find((candidate) => candidate.clientId === row.clientId) ?? config.shopifyApps[0];
  return {
    domain: row.domain,
    accessToken: open(row.accessToken),
    clientId: row.clientId ?? app?.clientId ?? '',
    clientSecret: open(row.clientSecret) ?? app?.clientSecret ?? '',
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

/**
 * The client for a registered store — refused, with the reason, when the
 * store is out of reach. Without this, an uninstalled store would quietly be
 * reached again through the app's own client credentials.
 */
export function clientFor(row: StoreRow): ShopifyClient {
  const reason = storeUnusableReason(row);
  if (reason) throw new ShopifyError(`${row.label}: ${reason}.`);
  return clientForStore(toStore(row));
}
