import type { LoaderFunctionArgs } from 'react-router';

import { COMPILER_VERSION, compile, toFragment, type Doc } from '../lib/compiler.server.ts';
import { requireShop } from '../lib/auth.server.ts';
import { db } from '../lib/db.server.ts';
import { themeHead } from '../lib/shared.ts';
import { readThemeStyle, storeForThemeStyle } from '../lib/theme-style.server.ts';

/**
 * Full-page preview of a page that may not be published anywhere yet.
 *
 * This is the same compiled output that publishing would ship (I1) — no editor
 * stamps, no bridge — rendered inside the store theme's own stylesheets, which
 * is the other half of "what you see is what gets published": without them the
 * page is previewed against the browser's defaults and the theme's typography
 * only shows up after publishing.
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireShop(request);
  const page = await db.page.findUnique({ where: { id: params.id } });
  if (!page) throw new Response('Página não encontrada', { status: 404 });

  const compiled = compile(JSON.parse(page.doc) as Doc);
  const store = await storeForThemeStyle(new URL(request.url).searchParams.get('shop'));
  const theme = await readThemeStyle(store?.domain);
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${page.title.replace(/</g, '&lt;')} — pré-visualização</title>
${themeHead(theme)}
</head>
<body style="margin:0">
${toFragment(compiled)}
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Dvfly-Compiler': COMPILER_VERSION,
    },
  });
}
