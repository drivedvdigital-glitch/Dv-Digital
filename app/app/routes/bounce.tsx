import type { LoaderFunctionArgs } from 'react-router';

import { config } from '../lib/config.server.ts';
import { db } from '../lib/db.server.ts';

/**
 * The session-token bounce.
 *
 * A document request inside the admin arrives without an ID token (App Bridge
 * only decorates `fetch`). This page loads App Bridge, asks it for a token and
 * goes back to where the request was headed with `?id_token=` — one hop the
 * person never notices. Outside the admin there is no App Bridge to ask, and
 * the page says so instead of spinning.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const to = url.searchParams.get('to') ?? '/app';
  // Only same-origin paths — never an open redirect.
  const target = to.startsWith('/') && !to.startsWith('//') ? to : '/app';

  let clientId = config.shopifyClientId ?? '';
  if (!clientId && !config.isProduction) {
    const store = await db.store.findFirst({ where: { clientId: { not: null } }, orderBy: { createdAt: 'asc' } });
    clientId = store?.clientId ?? '';
  }

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="shopify-api-key" content="${escapeAttr(clientId)}">
  <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
  <title>D&VFly</title>
  <style>body{font:14px/1.5 system-ui,sans-serif;color:#303030;padding:32px;max-width:520px}</style>
</head>
<body>
  <p id="msg">Abrindo o D&VFly…</p>
  <script>
    (async function () {
      var target = ${JSON.stringify(target)};
      try {
        if (!window.shopify || !window.shopify.idToken) throw new Error('fora do admin');
        var token = await window.shopify.idToken();
        var sep = target.indexOf('?') === -1 ? '?' : '&';
        window.location.replace(target + sep + 'id_token=' + encodeURIComponent(token));
      } catch (e) {
        document.getElementById('msg').textContent =
          'O D&VFly abre de dentro do admin da Shopify (Apps → D&VFly). Esta janela não está no admin, então não há como confirmar a loja.';
      }
    })();
  </script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function escapeAttr(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
