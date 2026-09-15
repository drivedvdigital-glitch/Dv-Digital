/**
 * The app's configuration, read once and validated.
 *
 * Every environment variable the app consumes is named here, with its default
 * and its rule — nowhere else reads `process.env` for these. Until this module
 * existed, `app/.env` reached the process only because the generated Prisma
 * client happened to load it at construction; moving the schema or lazy-loading
 * the database would have silently blanked the Shopify credentials.
 *
 * `.env` is loaded explicitly (Node's own `loadEnvFile`, no dependency), from
 * the app directory whether the process was started there (`react-router dev`,
 * `react-router-serve`) or from the repository root. Variables already set in
 * the environment win over the file, as they should on a real host.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { DEFAULT_API_VERSION } from '../../../packages/shopify/src/client.ts';

function loadDotEnv(): void {
  const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), 'app', '.env')];
  const file = candidates.find((path) => existsSync(path));
  if (!file) return;
  try {
    // Never overrides variables the environment already carries.
    process.loadEnvFile(file);
  } catch {
    // Unreadable file: the environment alone decides.
  }
}

loadDotEnv();

/** `YYYY-MM`, the only shape the Admin API accepts in the URL. */
const API_VERSION_SHAPE = /^\d{4}-(01|04|07|10)$/;

function apiVersion(): string {
  const wanted = process.env.SHOPIFY_API_VERSION?.trim();
  if (!wanted) return DEFAULT_API_VERSION;
  if (!API_VERSION_SHAPE.test(wanted)) {
    throw new Error(
      `SHOPIFY_API_VERSION="${wanted}" não tem o formato AAAA-MM de uma versão trimestral (ex.: ${DEFAULT_API_VERSION}).`,
    );
  }
  return wanted;
}

const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  isProduction,

  /** Pinned Admin API version. Shopify retires a version ~12 months after release. */
  shopifyApiVersion: apiVersion(),

  /**
   * The app's own credentials (Dev Dashboard). Optional at boot: a database
   * with a registered store carries the same pair. Required in production,
   * where no such fallback should decide anything.
   */
  shopifyClientId: process.env.SHOPIFY_CLIENT_ID?.trim() || null,
  shopifyClientSecret: process.env.SHOPIFY_CLIENT_SECRET?.trim() || null,

  /**
   * Origins allowed to POST to actions besides the app's own URL. Only the dev
   * tunnel needs this (its `https` origin never matches the `http` the server
   * sees). Empty in production unless set on purpose.
   */
  devActionOrigins: (process.env.DVFLY_DEV_ORIGINS ?? (isProduction ? '' : '*.trycloudflare.com'))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /**
   * Every request must carry a Shopify ID token (the app opened from the
   * admin). `DVFLY_AUTH=off` switches that off for local development only —
   * opening the app straight from localhost, or driving it with Playwright.
   * Production ignores the switch.
   */
  authRequired: isProduction || process.env.DVFLY_AUTH?.trim().toLowerCase() !== 'off',
};

if (config.isProduction && (!config.shopifyClientId || !config.shopifyClientSecret)) {
  throw new Error(
    'Em produção, SHOPIFY_CLIENT_ID e SHOPIFY_CLIENT_SECRET precisam estar no ambiente — ' +
      'o app não usa credenciais do banco como fonte primária fora do desenvolvimento.',
  );
}
