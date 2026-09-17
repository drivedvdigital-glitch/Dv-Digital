import type { LoaderFunctionArgs } from 'react-router';

import { lockEnabled, unlockedCount } from '../lib/access.server.ts';
import { COMPILER_VERSION } from '../lib/compiler.server.ts';
import { config } from '../lib/config.server.ts';
import { db } from '../lib/db.server.ts';

/**
 * Is the app up, and is it configured?
 *
 * Deliberately outside `requireShop`: this is what the proxy, the host's
 * uptime check and the person who just deployed ask, and none of them has a
 * Shopify ID token. It is also the only screen that can answer "the deploy
 * worked but the database is unreachable", which is the failure that otherwise
 * shows up as an unexplained error inside the admin.
 *
 * It answers with what is CONFIGURED, never with the values: `true` for a
 * credential that exists, the number of stores, the database round-trip. A
 * health endpoint that leaks configuration is a gift to whoever finds it.
 *
 * 200 when the database answers, 503 when it does not — so a load balancer
 * takes the instance out instead of sending people an error page.
 */
export async function loader(_: LoaderFunctionArgs) {
  const started = Date.now();
  let database: 'ok' | 'erro' = 'ok';
  let stores: number | null = null;
  let unlocked: number | null = null;
  try {
    stores = await db.store.count();
    unlocked = await unlockedCount();
  } catch {
    database = 'erro';
  }

  const body = {
    app: 'dvfly',
    compilador: COMPILER_VERSION,
    ambiente: config.isProduction ? 'produção' : 'desenvolvimento',
    banco: database,
    lojas: stores,
    // Configuration presence, never contents.
    credenciaisDaShopify: config.shopifyApps.length > 0,
    // Quantos apps da Shopify este servidor atende (uma loja por app custom).
    appsDaShopify: config.shopifyApps.length,
    tokensCriptografados: Boolean(config.tokenKey),
    lojasAutorizadas: config.allowedShops.length,
    // Whether the lock is on, and how many stores are through it. The key
    // itself never appears here, in any shape.
    senhaDeAcesso: lockEnabled(),
    lojasLiberadas: unlocked,
    ms: Date.now() - started,
  };

  return Response.json(body, {
    status: database === 'ok' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
