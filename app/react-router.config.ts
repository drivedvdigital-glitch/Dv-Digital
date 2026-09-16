import type { Config } from '@react-router/dev/config';

/**
 * React Router refuses action POSTs whose `Origin` header does not match the
 * URL the server sees — its CSRF protection. Behind the dev tunnel the
 * browser says `https://<random>.trycloudflare.com` while the tunnel hands
 * the server plain `http://`, so the origins never match and every Salvar /
 * Publicar / Criar died with an unexplained 400 inside the Shopify admin.
 *
 * The allowance is therefore a DEVELOPMENT setting: the tunnel domain by
 * default, anything else via `DVFLY_DEV_ORIGINS` (comma-separated), and
 * nothing at all in production unless that variable says so. Shipping the
 * wildcard to a real host would let any page on that tunnel domain post to
 * the app's actions.
 */
// `react-router dev` copies app/.env into process.env before this file runs,
// so an EMPTY `DVFLY_DEV_ORIGINS=""` (the .env.example default) must count as
// "not set" — otherwise the allow list is empty and every action through the
// tunnel dies with 400 inside the admin. That was the 16/09 "Bad Request".
const isProduction = process.env.NODE_ENV === 'production';
const allowedActionOrigins = (
  process.env.DVFLY_DEV_ORIGINS?.trim() || (isProduction ? '' : '*.trycloudflare.com')
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export default {
  ssr: true,
  allowedActionOrigins,
} satisfies Config;
