/**
 * The lock: an installed store still sees nothing until someone types the key.
 *
 * Why this exists on top of everything else: the app is custom-distribution,
 * so Shopify already ties it to stores that got an install link — but a link
 * can be forwarded, and a store can change hands. `DVFLY_ALLOWED_SHOPS` closes
 * that by naming the stores on the server; the key closes it without the
 * server having to be edited every time a store of ours is added.
 *
 * The unlock is remembered per STORE (`Store.authorizedAt`), not per person or
 * session: typed once, never asked again — including after the app is reopened,
 * reinstalled or updated. Uninstalling does not clear it; the store was ours
 * before and still is.
 */
import { AttemptLimiter } from './access.ts';
import { config } from './config.server.ts';
import { db } from './db.server.ts';

export { UNLOCK_PATH, waitLabel } from './access.ts';

/** Shared across requests; per process, like the rest of the app's memory. */
export const limiter = new AttemptLimiter();

/** Is the lock on at all? */
export function lockEnabled(): boolean {
  return Boolean(config.accessKey);
}

/**
 * May this store use the app?
 *
 * With no key configured the answer is always yes — the lock is opt-in, and a
 * laptop or an existing installation must not break the day this code lands.
 */
export async function storeUnlocked(shop: string): Promise<boolean> {
  if (!config.accessKey) return true;
  if (!shop) return false;
  const store = await db.store.findUnique({
    where: { domain: shop },
    select: { authorizedAt: true },
  });
  return Boolean(store?.authorizedAt);
}

/**
 * Records that this store was unlocked.
 *
 * Upsert, because the unlock happens BEFORE the install: the gate stops the
 * request that would have created the row. The label is provisional — the
 * install that follows replaces it with the store's real name.
 */
export async function unlockStore(shop: string): Promise<void> {
  const now = new Date();
  await db.store.upsert({
    where: { domain: shop },
    create: { domain: shop, label: shop.replace('.myshopify.com', ''), authorizedAt: now },
    update: { authorizedAt: now },
  });
}

/** How many stores are through the lock — for `/healthz`. */
export function unlockedCount(): Promise<number> {
  return db.store.count({ where: { authorizedAt: { not: null } } });
}
