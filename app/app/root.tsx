import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  useRouteLoaderData,
} from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';

import { db } from './lib/db.server.ts';

/**
 * App Bridge needs the app's client id to boot. It comes from the environment
 * or, failing that, from any registered store — every store runs the same app,
 * so any row's client id is the app's client id. No settings screen.
 */
export async function loader(_: LoaderFunctionArgs) {
  let clientId = process.env.SHOPIFY_CLIENT_ID ?? '';
  if (!clientId) {
    const store = await db.store.findFirst({ orderBy: { createdAt: 'asc' } }).catch(() => null);
    clientId = store?.clientId ?? '';
  }
  return { clientId };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>('root');
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>D&VFly</title>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        {/*
          App Bridge has to be the first script on the page and is loaded from
          Shopify's CDN, not npm. It reads the client id from the data attribute
          and is what makes the app embed properly in the admin.
        */}
        <script
          src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
          data-api-key={data?.clientId || undefined}
        />
        {/* Polaris web components: the admin look, without the deprecated React package. */}
        <script src="https://cdn.shopify.com/shopifycloud/polaris.js" type="module" />
        {/*
          ui-nav-menu holds the links App Bridge mirrors into the admin sidebar.
          Outside the admin App Bridge never registers the element, which would
          leave its raw <a> children rendered inline — so hide it until defined.
        */}
        <style>{`ui-nav-menu:not(:defined) { display: none }`}</style>
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Erro desconhecido';

  return (
    <s-page heading="Algo deu errado">
      <s-banner tone="critical" heading="Erro">
        <s-paragraph>{message}</s-paragraph>
      </s-banner>
    </s-page>
  );
}
