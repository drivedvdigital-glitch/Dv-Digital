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
import { clientIdForRequest } from './lib/shopify.server.ts';

/**
 * App Bridge needs the app's client id to boot. It comes from the environment
 * or, failing that (development only), from any registered store — every store
 * runs the same app, so any row's client id is the app's client id.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  // Which app, not just "the app": a second store of yours installs a second
  // Shopify app (custom distribution is one app per store), and App Bridge has
  // to boot with the id of the one THIS store installed.
  let clientId = await clientIdForRequest(request).catch(() => '');
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
        {/* The admin's typeface, so the app reads as part of it. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        />
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
        {/* Polaris web components are loaded by the error screen alone (the
            only place that uses them): 100 KB gzipped of script on every
            page load, competing with the editor on a phone, for a screen
            that is not on the page. */}
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

  // The browser could not reach the server at all: the dev tunnel dropped or
  // changed address, or the server was restarting. Nothing in the app is
  // wrong, and a reload is the whole fix — so the screen says that, not
  // "Failed to fetch".
  const offline = error instanceof Error && /failed to fetch|networkerror|load failed|network request failed/i.test(error.message);
  // The admin look for this screen alone — see the note in Layout.
  const polaris = <script src="https://cdn.shopify.com/shopifycloud/polaris.js" type="module" />;
  if (offline) {
    return (
      <s-page heading="Sem conexão com o servidor do DVFly">
        {polaris}
        <s-banner tone="warning" heading="O navegador não conseguiu falar com o servidor">
          <s-paragraph>
            Isso acontece quando o túnel cai ou muda de endereço, ou quando o servidor está
            reiniciando (por exemplo, logo depois de atualizar o código). Recarregue a página.
            Se continuar, confira na janela do DVFly se o endereço público mudou e cole o novo
            no App URL do app na Shopify.
          </s-paragraph>
          <s-button variant="primary" onClick={() => window.location.reload()}>
            Recarregar
          </s-button>
        </s-banner>
        {detail ? (
          <s-section heading="Detalhe técnico">
            <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0 }}>{detail}</pre>
          </s-section>
        ) : null}
      </s-page>
    );
  }

  return (
    <s-page heading="Algo deu errado">
      {polaris}
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
