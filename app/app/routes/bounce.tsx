import type { LoaderFunctionArgs } from 'react-router';

import { BOUNCED_PARAM } from '../lib/auth.server.ts';
import { config } from '../lib/config.server.ts';
import { db } from '../lib/db.server.ts';
import { appCredentialsList, SHOP_DOMAIN } from '../lib/shopify.server.ts';

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
  // A loja vem do endereço desta página; do destino só como reserva, para um
  // /bounce montado à mão.
  const shop = (
    url.searchParams.get('shop') ??
    new URLSearchParams(target.split('?')[1] ?? '').get('shop') ??
    ''
  ).toLowerCase();
  const host = url.searchParams.get('host') ?? new URLSearchParams(target.split('?')[1] ?? '').get('host') ?? '';

  // WHICH app's key boots App Bridge here.
  //
  // For a store already in the database, its row says. For a store that is NOT
  // there yet — a second store, the moment it installs — nothing on this
  // request says: no token, no row, and the admin does not name the app. With
  // one app configured that is a non-question; with two, picking the first is a
  // coin flip, and the wrong key means App Bridge never initialises, the page
  // never gets a token, and the merchant reads "the Shopify script did not
  // load" while the script loaded fine.
  //
  // So an unknown store TRIES the apps, one per reload: `?app=1`, `?app=2`, …
  // The wrong key costs one reload; the right one registers the store, and from
  // then on its row answers immediately.
  const apps = await appCredentialsList().catch(() => []);
  const tentativa = Math.max(0, Math.min(apps.length - 1, Number(url.searchParams.get('app') ?? 0) || 0));
  let clientId = '';
  if (SHOP_DOMAIN.test(shop)) {
    const row = await db.store.findUnique({ where: { domain: shop }, select: { clientId: true } }).catch(() => null);
    clientId = apps.find((app) => app.clientId === row?.clientId)?.clientId ?? '';
  }
  const adivinhando = clientId === '';
  if (!clientId) clientId = apps[tentativa]?.clientId ?? '';
  // How many are left to try, for the script below. Zero when the store is
  // known: there is nothing to guess.
  const faltam = adivinhando ? apps.length - tentativa - 1 : 0;
  if (!clientId && !config.isProduction) {
    const store = await db.store.findFirst({ where: { clientId: { not: null } }, orderBy: { createdAt: 'asc' } });
    clientId = store?.clientId ?? '';
  }

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="shopify-api-key" content="${escapeAttr(clientId)}">
  <!--
    O App Bridge exige apiKey E shop ("missing required configuration fields").
    Ele le daqui e da query desta pagina - nunca de dentro do parametro to.
    Sem o shop ele lanca e aborta, e a pagina acusa "o script nao carregou"
    quando o script carregou e foi ele que desistiu.
  -->
  ${SHOP_DOMAIN.test(shop) ? `<meta name="shopify-shop" content="${escapeAttr(shop)}">` : ''}
  ${host ? `<meta name="shopify-host" content="${escapeAttr(host)}">` : ''}
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
        if (!window.shopify || !window.shopify.idToken) throw new Error('sem-app-bridge');
        var token = await window.shopify.idToken();
        window.location.replace(target + '&id_token=' + encodeURIComponent(token));
      } catch (e) {
        // Ainda há app para tentar: a chave desta vez pode simplesmente não ser
        // a do app que o admin embutiu. Uma recarga, a próxima chave.
        if (${faltam} > 0) {
          var proxima = ${JSON.stringify(`/bounce?app=${tentativa + 1}&to=`).replace(/</g, '\u003c')} + encodeURIComponent(${JSON.stringify(target).replace(/</g, '\u003c')});
          window.location.replace(proxima);
          return;
        }
        // As duas falhas são muito diferentes e levavam o mesmo texto, que
        // mandava o lojista para onde ele já estava ("abra pelo admin") quando
        // o problema era o script bloqueado no navegador dele.
        // Sem chutar culpado: o texto diz o que FOI observado. A versão
        // anterior afirmava que o navegador estava bloqueando o script, e
        // mandou caçar um bloqueio que não existia — o script carregava e
        // desistia por falta de configuração, que era defeito nosso.
        document.getElementById('msg').textContent = e && e.message === 'sem-app-bridge'
          ? 'Esta janela não conseguiu confirmar a loja: o App Bridge da Shopify não se registrou aqui. Se você abriu isto DENTRO do admin, recarregue; se continuar, abra o console do navegador (F12) — o App Bridge escreve ali o motivo exato — e mande o print para quem cuida do D&VFly. Fora do admin, abra o app em Apps → DVHub Application.'
          : 'A Shopify não devolveu a confirmação da loja nesta janela (' + ((e && e.message) || 'sem detalhe') + '). Recarregue; se continuar, abra o app pelo admin em Apps → DVHub Application.';
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
