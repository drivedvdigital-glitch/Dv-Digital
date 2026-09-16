/**
 * Constants the browser bundle may carry.
 *
 * Route components render on the client too, so anything they read must not
 * come from a `.server.ts` module — React Router strips those from `loader`
 * and `action` only, and refuses the build when a component reaches into one.
 * The limits and names below are pure values from the packages, re-exported
 * from a client-safe path.
 */
export { BUDGET_BYTES, PAGE_BODY_LIMIT_BYTES, TEMPLATE_LIMIT_BYTES } from '../../../packages/compiler/src/limits.ts';
export { SOLO_SUFFIX } from '../../../packages/shopify/src/constants.ts';

/**
 * A deep link into the store's theme editor, opened on ONE template — the
 * screen where the merchant hides or reorders the theme's own sections
 * around the page's content. `themes/current` is the live theme, so no
 * theme id has to be fetched; `previewPath` makes the editor show the
 * page (or a product that adopted it) instead of a random one.
 */
export function themeEditorUrl(domain: string, template: string, previewPath?: string): string {
  const handle = domain.replace(/\.myshopify\.com$/i, '');
  const params = new URLSearchParams({ template });
  if (previewPath) params.set('previewPath', previewPath);
  return `https://admin.shopify.com/store/${handle}/themes/current/editor?${params.toString()}`;
}
