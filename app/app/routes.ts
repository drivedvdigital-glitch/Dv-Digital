import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  // Shopify loads the app at its App URL with ?shop=&host=. That lands here.
  index('routes/home.tsx'),
  route('app', 'routes/app.tsx', [
    index('routes/app._index.tsx'),
    route('pages/:id', 'routes/app.pages.$id.tsx'),
  ]),
  route('api/preview/:id', 'routes/api.preview.$id.tsx'),
  route('api/pages/:id/export', 'routes/api.pages.$id.export.tsx'),
  route('api/theme-style', 'routes/api.theme-style.tsx'),
  route('api/products', 'routes/api.products.tsx'),
  route('preview/:id', 'routes/preview.$id.tsx'),
  // Session-token bounce and Shopify webhooks (see auth.server.ts / webhooks.$topic.tsx).
  route('bounce', 'routes/bounce.tsx'),
  route('webhooks/:topic', 'routes/webhooks.$topic.tsx'),
] satisfies RouteConfig;
