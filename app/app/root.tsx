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

import { config } from './lib/config.server.ts';
import { db } from './lib/db.server.ts';

/**
 * App Bridge needs the app's client id to boot. It comes from the environment
 * or, failing that (development only), from any registered store — every store
 * runs the same app, so any row's client id is the app's client id.
 */
export async function loader(_: LoaderFunctionArgs) {
  let clientId = config.shopifyClientId ?? '';
  if (!clientId && !config.isProduction) {
    const store = await db.store.findFirst({ orderBy: { createdAt: 'asc' } }).catch(() => null);
    clientId = store?.clientId ?? '';
  }
  return { clientId, showErrorDetail: !config.isProduction };
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
        {/* The meta tag is the form the current App Bridge docs specify; the
            data attribute is the older one and still honoured. Both, so an
            App Bridge update on the CDN cannot take the embedding down. */}
        {data?.clientId ? <meta name="shopify-api-key" content={data.clientId} /> : null}
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
  const data = useRouteLoaderData<typeof loader>('root');
  // Outside production the loader is what decides; when the loader itself
  // failed there is no data, and showing the detail is the useful default.
  const showDetail = data?.showErrorDetail ?? true;

  // The whole error, not a polite summary: when this screen shows up inside
  // the admin on someone else's machine, its text is the only diagnostic that
  // exists. A vague "Bad Request" here once cost a whole debugging round.
  // In production the stack stays in the server log — file paths and queries
  // are not for whoever loaded the page.
  let message = 'Erro desconhecido';
  let detail = '';
  if (isRouteErrorResponse(error)) {
    message = `HTTP ${error.status} ${error.statusText}`;
    detail = typeof error.data === 'string' ? error.data : JSON.stringify(error.data, null, 2);
  } else if (error instanceof Error) {
    message = error.message;
    detail = showDetail ? (error.stack ?? '') : '';
  } else if (error !== undefined) {
    detail = showDetail ? String(error) : '';
  }

  return (
    <s-page heading="Algo deu errado">
      <s-banner tone="critical" heading={message}>
        <s-paragraph>
          Manda um print desta tela inteira — o texto abaixo diz exatamente o que falhou.
        </s-paragraph>
      </s-banner>
      {detail ? (
        <s-section heading="Detalhe técnico">
          <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0 }}>
            {detail}
          </pre>
        </s-section>
      ) : null}
    </s-page>
  );
}
