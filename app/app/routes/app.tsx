import { data, Link, Outlet, useLoaderData, useLocation } from 'react-router';
import type { HeadersFunction, LoaderFunctionArgs } from 'react-router';

import { db } from '../lib/db.server.ts';

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
  const storeCount = await db.store.count();
  return data(
    {
      shop,
      storeCount,
      clientId: process.env.SHOPIFY_CLIENT_ID ?? '',
    },
    { headers: { 'Content-Security-Policy': frameAncestors(shop) } },
  );
}

export const headers: HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

/**
 * The frame: brand, tabs, and whatever screen is active.
 *
 * Tabs preserve the query string because Shopify's `shop` and `host` params
 * have to survive navigation or the app falls out of its embedded context.
 */
export default function AppFrame() {
  const { shop, storeCount } = useLoaderData<typeof loader>();
  const location = useLocation();
  const search = location.search;

  const tabs = [
    { to: `/app${search}`, label: 'Páginas', match: (p: string) => p === '/app' },
    { to: `/app/stores${search}`, label: `Lojas${storeCount ? ` (${storeCount})` : ''}`, match: (p: string) => p.startsWith('/app/stores') },
  ];

  return (
    <div style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif', color: '#17201c' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 20px',
          borderBottom: '1px solid #e3e3e3',
        }}
      >
        <img src="/mark.svg" alt="" width={26} height={26} />
        <strong style={{ fontSize: 16, letterSpacing: '-0.01em' }}>D&amp;VFly</strong>
        {shop ? (
          <span style={{ marginLeft: 'auto', fontSize: 13, color: '#5d6b64' }}>{shop}</span>
        ) : null}
      </header>

      <nav style={{ display: 'flex', gap: 4, padding: '0 12px', borderBottom: '1px solid #e3e3e3' }}>
        {tabs.map((tab) => {
          const active = tab.match(location.pathname);
          return (
            <Link
              key={tab.label}
              to={tab.to}
              style={{
                padding: '12px 14px',
                fontSize: 14,
                textDecoration: 'none',
                color: active ? '#17201c' : '#5d6b64',
                fontWeight: active ? 600 : 400,
                borderBottom: active ? '2px solid #0BE05C' : '2px solid transparent',
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <main style={{ padding: 20, maxWidth: 1100 }}>
        <Outlet />
      </main>
    </div>
  );
}
