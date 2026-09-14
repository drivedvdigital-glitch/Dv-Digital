/**
 * Bridges the app to the Shopify packages.
 *
 * Credentials live per store in the database, which is what lets one running
 * app publish to several stores (docs/ARQUITETURA.md 2.5). Nothing here is
 * store-specific at module scope.
 */
import type { Store as StoreRow } from '@prisma/client';

import { ShopifyClient } from '../../../packages/shopify/src/client.ts';
import type { Store } from '../../../packages/shopify/src/deploy.ts';

export { deployPage, formatDeployResult, ProductionNotAllowedError } from '../../../packages/shopify/src/deploy.ts';
export { ShopifyClient } from '../../../packages/shopify/src/client.ts';

/** Database row to the shape the deploy package expects. */
export function toStore(row: StoreRow): Store {
  return {
    domain: row.domain,
    clientId: row.clientId,
    clientSecret: row.clientSecret,
    label: row.label,
    isProduction: row.isProduction,
  };
}

export function clientFor(row: StoreRow): ShopifyClient {
  return new ShopifyClient(toStore(row));
}
