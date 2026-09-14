import type { Config } from '@react-router/dev/config';

export default {
  ssr: true,

  /**
   * React Router refuses action POSTs whose `Origin` header does not match the
   * URL the server sees — its CSRF protection. Behind the dev tunnel the
   * browser says `https://<random>.trycloudflare.com` while the tunnel hands
   * the server plain `http://`, so the origins never match and every Salvar /
   * Publicar / Criar died with an unexplained 400 inside the Shopify admin.
   *
   * The wildcard allows exactly the tunnel's domain. This is a development
   * convenience: in production the app terminates TLS on its own host, the
   * origins match by themselves, and this entry does nothing.
   */
  allowedActionOrigins: ['*.trycloudflare.com'],
} satisfies Config;
