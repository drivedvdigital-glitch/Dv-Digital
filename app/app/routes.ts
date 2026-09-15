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
  route('preview/:id', 'routes/preview.$id.tsx'),
] satisfies RouteConfig;
