import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from 'react-router';

export function Layout({ children }: { children: React.ReactNode }) {
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
          data-api-key={
            typeof document === 'undefined'
              ? (globalThis as { __DVFLY_CLIENT_ID__?: string }).__DVFLY_CLIENT_ID__
              : undefined
          }
        />
        {/* Polaris web components: the admin look, without the deprecated React package. */}
        <script src="https://cdn.shopify.com/shopifycloud/polaris.js" type="module" />
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
