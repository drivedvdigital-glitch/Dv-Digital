import type { LoaderFunctionArgs } from 'react-router';

import { searchProducts } from '../../../packages/shopify/src/products.ts';
import { requireShop } from '../lib/auth.server.ts';
import { db } from '../lib/db.server.ts';
import { clientFor } from '../lib/shopify.server.ts';

/**
 * Product search for the settings drawer: `?storeId=&q=`. Products are per
 * store (their ids differ from store to store), so the search always names
 * the store it runs against.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  await requireShop(request);
  const url = new URL(request.url);
  const storeId = url.searchParams.get('storeId') ?? '';
  const q = (url.searchParams.get('q') ?? '').slice(0, 80);
  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!store) return Response.json({ error: 'Loja desconhecida.' }, { status: 404 });
  try {
    const products = await searchProducts(clientFor(store), q, 8);
    return Response.json({ products });
  } catch (error) {
    return Response.json(
      { error: `Não consegui buscar produtos em ${store.label}: ${error instanceof Error ? error.message : error}` },
      { status: 502 },
    );
  }
}
