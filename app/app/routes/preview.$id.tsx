import type { LoaderFunctionArgs } from 'react-router';

import { COMPILER_VERSION, compile, toFragment, type Doc } from '../lib/compiler.server.ts';
import { db } from '../lib/db.server.ts';

/**
 * Full-page preview of a page that may not be published anywhere yet.
 *
 * This is the same compiled output that publishing would ship (I1) — no editor
 * stamps, no bridge — wrapped in a minimal document so it can be opened in a
 * plain browser tab straight from the pages list.
 */
export async function loader({ params }: LoaderFunctionArgs) {
  const page = await db.page.findUnique({ where: { id: params.id } });
  if (!page) throw new Response('Página não encontrada', { status: 404 });

  const compiled = compile(JSON.parse(page.doc) as Doc);
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${page.title.replace(/</g, '&lt;')} — pré-visualização</title>
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
