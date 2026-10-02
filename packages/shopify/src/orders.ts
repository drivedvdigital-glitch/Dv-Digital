/**
 * Orders, for the A/B report.
 *
 * Attribution is by PRODUCT, not by session: each variant of a test is its own
 * product, so an order that contains `piadebanho2` is an order of variant 2,
 * whatever form or app created it (a COD form creates the order through the
 * API and never passes through the cart — a cart attribute or a checkout pixel
 * would miss it; the line item never does). The honest consequence, said on
 * the screen: an order of that product that came from somewhere else (a
 * direct link, another ad) is counted too.
 *
 * Shopify's order search cannot filter by product, so the app keeps a light
 * copy of the store's orders (id, dates, total, product ids — no customer
 * data) and syncs it incrementally by `updated_at`: new orders and
 * cancellations both move that date. This module only reads; storing is the
 * app's job.
 *
 * Needs the `read_orders` scope (the last 60 days; older orders need
 * `read_all_orders`) and the app's protected-customer-data declaration.
 */

import { ShopifyError, type ShopifyClient } from './client.ts';

export interface OrderLite {
  id: string;
  createdAt: string;
  updatedAt: string;
  cancelled: boolean;
  test: boolean;
  total: number;
  currency: string;
  /** Products in the order (deleted products drop out), deduplicated. */
  productIds: string[];
}

/**
 * The shop's IANA timezone ("America/Bogota"), the one its days are counted
 * in, and the address visitors see (`https://ofertascolombianas.store`).
 */
export async function shopInfo(client: ShopifyClient): Promise<{ timezone: string; url: string | null }> {
  const data = await client.graphql<{ shop: { ianaTimezone: string; primaryDomain: { url: string } | null } }>(
    `{ shop { ianaTimezone primaryDomain { url } } }`,
  );
  return { timezone: data.shop.ianaTimezone || 'UTC', url: data.shop.primaryDomain?.url ?? null };
}

type OrderNode = {
  id: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  test: boolean;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  lineItems: { nodes: Array<{ product: { id: string } | null }> };
};

/** Turns the refusal Shopify gives without the scope/declaration into the steps that fix it. */
function explainRefusal(client: ShopifyClient, error: unknown): unknown {
  if (error instanceof ShopifyError && error.isAccessDenied) {
    return new ShopifyError(
      `A Shopify recusou a leitura de pedidos em ${client.domain}. Duas coisas precisam estar feitas: ` +
        '(1) o app com o escopo read_orders publicado e lançado (shopify app deploy + "Release" no Dev Dashboard) ' +
        'e a permissão aprovada no admin da loja; (2) no Dev Dashboard do app, "Acesso a dados protegidos de ' +
        'clientes" preenchido (nível 1 basta: o relatório não lê nome, e-mail nem endereço). ' +
        `Resposta da Shopify: ${error.message}`,
      error.detail,
    );
  }
  return error;
}

/**
 * Orders updated at or after `since`, oldest change first, at most
 * `maxPages` × 50. `complete` false means there is more: call again from
 * `resumeFrom` (the last `updatedAt` read — an order updated at that same
 * instant is read twice, which an upsert absorbs).
 *
 * 50 orders × 10 line items per page keeps a request well under Shopify's
 * 1000-point query cost; the client already waits out throttling.
 */
export async function ordersUpdatedSince(
  client: ShopifyClient,
  since: Date,
  options: { maxPages?: number } = {},
): Promise<{ orders: OrderLite[]; complete: boolean; resumeFrom: Date | null }> {
  const { maxPages = 40 } = options;
  const query = `updated_at:>='${since.toISOString()}'`;
  const orders: OrderLite[] = [];
  let after: string | null = null;
  for (let page = 0; ; page++) {
    let data: { orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: OrderNode[] } };
    try {
      data = await client.graphql(
        `query DvflyAbOrders($query: String!, $after: String) {
           orders(first: 50, after: $after, query: $query, sortKey: UPDATED_AT) {
             pageInfo { hasNextPage endCursor }
             nodes {
               id
               createdAt
               updatedAt
               cancelledAt
               test
               totalPriceSet { shopMoney { amount currencyCode } }
               lineItems(first: 10) { nodes { product { id } } }
             }
           }
         }`,
        { query, after },
      );
    } catch (error) {
      throw explainRefusal(client, error);
    }
    for (const node of data.orders.nodes) {
      orders.push({
        id: node.id,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        cancelled: Boolean(node.cancelledAt),
        test: node.test,
        total: Number(node.totalPriceSet.shopMoney.amount) || 0,
        currency: node.totalPriceSet.shopMoney.currencyCode,
        productIds: [...new Set(node.lineItems.nodes.map((li) => li.product?.id).filter((id): id is string => !!id))],
      });
    }
    if (!data.orders.pageInfo.hasNextPage) return { orders, complete: true, resumeFrom: null };
    if (page + 1 >= maxPages) {
      const last = orders[orders.length - 1];
      return { orders, complete: false, resumeFrom: last ? new Date(last.updatedAt) : since };
    }
    after = data.orders.pageInfo.endCursor;
  }
}
