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

/** The shape `/api/theme-style` answers with (mirrors ThemeStyle, client-safe). */
export interface ThemeStyleData {
  body: string | null;
  heading: string | null;
  links: string[];
  css: string;
}

/**
 * The store theme's styling as a document head, for anything that shows a page
 * before it is published: the editor canvas and the full-page preview.
 *
 * The theme comes first, exactly as the storefront loads it — its stylesheets,
 * then its settings block — so the same cascade decides there and here. Without
 * it, the preview renders our blocks over the browser's defaults: measured on
 * 16/09 as 470 computed-style differences on a single page (Times New Roman for
 * the theme's font, headings at half size, a divider with 8px of margin where
 * the store gives it 70px).
 *
 * A theme that hides its page until its own JavaScript runs would leave the
 * preview blank, since none of the theme's scripts are loaded here — the last
 * rule keeps the document visible whatever the theme's veil says.
 */
export function themeHead(theme: ThemeStyleData | null): string {
  if (!theme) return '';
  const links = theme.links
    .filter((url) => url.startsWith('https://'))
    .map((url) => `<link rel="stylesheet" href="${url.replace(/"/g, '&quot;')}">`)
    .join('');
  const settings = theme.css ? `<style>${theme.css}</style>` : '';
  // A theme old enough not to emit a settings block still tells us its fonts,
  // and the font tokens in the style vocabulary compile to these variables.
  const font = (value: string | null) => (value && !/[<>{};]/.test(value) ? value : null);
  const vars = settings
    ? ''
    : [
        font(theme.body) && `--font-body-family:${font(theme.body)}`,
        font(theme.heading) && `--font-heading-family:${font(theme.heading)}`,
      ]
        .filter(Boolean)
        .join(';');
  const fallback = vars ? `<style>:root{${vars}}</style>` : '';
  const veil =
    links || settings ? '<style>html,body{opacity:1!important;visibility:visible!important}</style>' : '';
  return links + settings + fallback + veil;
}
