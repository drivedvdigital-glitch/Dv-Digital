/**
 * Liquid inside pasted HTML.
 *
 * A published page lives inside a theme section, wrapped in `{% raw %}` so a
 * stray `{{` in someone's markup reaches the browser as text. But merchants
 * paste HTML that is MEANT to run on the store — `{% include 'gtm-roteador' %}`,
 * a footer reading `{{ shop.name }}` or variables a snippet assigned — and
 * inside `{% raw %}` all of it is printed as text instead.
 *
 * So an HTML block whose source carries Liquid is fenced by two markers. The
 * Shopify packager (`productSectionLiquid`) leaves what is between them OUT
 * of the raw region, where the theme runs it; everywhere else (the editor's
 * canvas, a regular Shopify page, whose body Shopify never runs as Liquid)
 * the markers are plain comments and the Liquid shows as written.
 */

export const LIQUID_OPEN = '<!--dvf-liquid-->';
export const LIQUID_CLOSE = '<!--/dvf-liquid-->';

/** One Liquid tag or output: `{% … %}` / `{{ … }}`, whitespace-control dashes included. */
const LIQUID = /\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\}/g;

export function hasLiquid(source: string): boolean {
  LIQUID.lastIndex = 0;
  return LIQUID.test(source);
}

/**
 * Runs `transform` over the markup with every Liquid tag and output swapped
 * for an inert placeholder, then puts them back: the HTML pass must not parse,
 * rescope or rewrite the Liquid itself (a `{{ x | img_url }}` in a `src`, an
 * `{% if %}` between attributes).
 */
export function withLiquidProtected(source: string, transform: (markup: string) => string): string {
  const saved: string[] = [];
  const protectedSource = source.replace(LIQUID, (match) => `dvflq${saved.push(match) - 1}q`);
  if (saved.length === 0) return transform(source);
  // A placeholder that ended up as an attribute name comes back as `x=""`.
  return transform(protectedSource).replace(/dvflq(\d+)q(?:="")?/g, (whole, index: string) => saved[Number(index)] ?? whole);
}

/** The regions between the markers, and what is outside them, in order. */
export function liquidRegions(fragment: string): Array<{ liquid: boolean; text: string }> {
  const parts: Array<{ liquid: boolean; text: string }> = [];
  let at = 0;
  while (at < fragment.length) {
    const open = fragment.indexOf(LIQUID_OPEN, at);
    if (open === -1) break;
    const close = fragment.indexOf(LIQUID_CLOSE, open + LIQUID_OPEN.length);
    if (close === -1) break;
    if (open > at) parts.push({ liquid: false, text: fragment.slice(at, open) });
    parts.push({ liquid: true, text: fragment.slice(open + LIQUID_OPEN.length, close) });
    at = close + LIQUID_CLOSE.length;
  }
  if (at < fragment.length) parts.push({ liquid: false, text: fragment.slice(at) });
  return parts;
}

/** The fragment with the markers taken out (where Liquid cannot run anyway). */
export function stripLiquidMarkers(fragment: string): string {
  return fragment.split(LIQUID_OPEN).join('').split(LIQUID_CLOSE).join('');
}
