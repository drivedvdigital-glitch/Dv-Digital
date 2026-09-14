import { data, Outlet, useLoaderData } from 'react-router';
import type { HeadersFunction, LoaderFunctionArgs } from 'react-router';

import { ensureStore } from '../lib/shopify.server.ts';

/** A myshopify domain and nothing else — this value ends up inside a CSP. */
const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

/**
 * Lets the Shopify admin put this app in an iframe, and nobody else.
 *
 * Embedded apps are framed by `admin.shopify.com` and by the store's own
 * domain. A page with no CSP at all is framable by *any* site, which is how
 * clickjacking works, so the allowance is written out explicitly and scoped to
 * the shop that asked. Without a `shop` in the URL there is no legitimate
 * framer, and the header says so.
 */
function frameAncestors(shop: string | null): string {
  const origins = ['https://admin.shopify.com'];
  if (shop && SHOP_DOMAIN.test(shop)) origins.push(`https://${shop}`);
  return `frame-ancestors ${origins.join(' ')};`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get('shop');

  // A store that opens the app registers itself — install, open, use.
  // There is no store settings screen to fill in first.
  if (shop) await ensureStore(shop);

  return data(
    { shop },
    { headers: { 'Content-Security-Policy': frameAncestors(shop) } },
  );
}

export const headers: HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

/**
 * The frame is deliberately empty chrome: no app title, no logo, no tab bar.
 *
 * Embedded, the admin already draws the app's name and icon above this iframe,
 * and navigation lives in the admin's own sidebar via `ui-nav-menu` — the same
 * place the reference app puts it. App Bridge reads the links and mirrors them
 * as sub-items; the element itself renders nothing, and root.tsx hides it when
 * App Bridge is absent so plain links never leak into the page.
 */
export default function AppFrame() {
  useLoaderData<typeof loader>();
  return (
    <>
      <ui-nav-menu>
        <a href="/app" rel="home">
          Início
        </a>
        <a href="/app">Páginas</a>
      </ui-nav-menu>
      <Outlet />
    </>
  );
}
