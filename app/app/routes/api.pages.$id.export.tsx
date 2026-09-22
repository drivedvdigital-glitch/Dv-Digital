import type { LoaderFunctionArgs } from 'react-router';

import { requireShop } from '../lib/auth.server.ts';
import { db } from '../lib/db.server.ts';

/**
 * Exports a page as a portable .json file: title, handle and the block
 * document. Importing this file on another installation recreates the page —
 * the "move a page between accounts" flow, without any proprietary opacity:
 * the file is the same document the editor edits, readable by anyone.
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireShop(request);
  const page = await db.page.findUnique({ where: { id: params.id } });
  if (!page) throw new Response('Página não encontrada', { status: 404 });

  // The page settings travel too: a product page or a chrome-less landing
  // page comes back as what it was. Product links do not — they name
  // products of specific stores, and one product renders one page.
  const payload = {
    dvfly: 1,
    exportedAt: new Date().toISOString(),
    title: page.title,
    handle: page.handle,
    pageType: page.pageType,
    showChrome: page.showChrome,
    productContentAbove: page.productContentAbove,
    bareLayout: page.bareLayout,
    doc: JSON.parse(page.doc),
  };

  const safeName = page.handle.replace(/[^a-z0-9-]/gi, '') || 'pagina';
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="dvfly-${safeName}.json"`,
    },
  });
}
