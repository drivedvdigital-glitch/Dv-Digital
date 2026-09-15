import type { LoaderFunctionArgs } from 'react-router';

import { BOUNCED_PARAM } from '../lib/auth.server.ts';
import { config } from '../lib/config.server.ts';
import { db } from '../lib/db.server.ts';
import { SHOP_DOMAIN } from '../lib/shopify.server.ts';

/**
 * The session-token bounce.
 *
 * A document request inside the admin arrives without an ID token (App Bridge
 * only decorates `fetch`). This page loads App Bridge, asks it for a token and
 * goes back to where the request was headed with `?id_token=` — one hop the
 * person never notices. Outside the admin there is no App Bridge to ask, and
 * the page says so instead of spinning.
 *
 * The destination is parsed as a URL and kept only when it resolves to this
 * origin: `//host`, `/\host` and friends all fall back to /app. What reaches
 * the inline script is JSON with `<` escaped, so no destination can close the
 * script tag.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  // The mark rides on the fallback too: a token that still fails on /app
  // must be refused there, not bounced again.
  let target = `/app?${BOUNCED_PARAM}=1`;
  try {
    const parsed = new URL(url.searchParams.get('to') ?? '/app', url.origin);
    if (parsed.origin === url.origin && parsed.pathname !== '/bounce') {
      parsed.searchParams.delete('id_token');
      parsed.searchParams.set(BOUNCED_PARAM, '1');
      target = parsed.pathname + parsed.search;
    }
  } catch {
    // Unparseable destination: the app's front door.
  }
  const shop = new URLSearchParams(target.split('?')[1] ?? '').get('shop')?.toLowerCase() ?? '';

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
      var target = ${JSON.stringify(target).replace(/</g, '\\u003c')};
      try {
        if (!window.shopify || !window.shopify.idToken) throw new Error('fora do admin');
        var token = await window.shopify.idToken();
        window.location.replace(target + '&id_token=' + encodeURIComponent(token));
      } catch (e) {
        document.getElementById('msg').textContent =
          'O D&VFly abre de dentro do admin da Shopify (Apps → D&VFly). Esta janela não está no admin, então não há como confirmar a loja.';
      }
    })();
  </script>
</body>
</html>`;
  const framers = ['https://admin.shopify.com'];
  if (SHOP_DOMAIN.test(shop)) framers.push(`https://${shop}`);
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': `frame-ancestors ${framers.join(' ')};`,
    },
  });
}

function escapeAttr(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
