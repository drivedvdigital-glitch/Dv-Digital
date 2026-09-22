/**
 * Images, sized for the screen that asks for them.
 *
 * What the field data on the first live product page said (docs/PROGRESSO.md,
 * 21/09): LCP 3.1 s on phones, Core Web Vitals failed — and the LCP element
 * was our hero image, shipped at its full 250 KB with no size hint of any
 * kind. Shopify's own performance guidance names the three fixes, and all
 * three are the compiler's job, not the author's:
 *
 *   - never lazy-load the LCP image; give it `fetchpriority="high"`;
 *   - serve every image through the CDN's resizer (`?width=`) with a `srcset`
 *     and `sizes`, so a phone downloads a phone-sized file;
 *   - declare dimensions, because their absence is what causes layout shift.
 *
 * Everything here is pure and conservative: an image the author already
 * sized (a `width=`/`height=`/`crop=` in the URL, or a `srcset` of his own) is
 * left exactly as written, and only URLs on Shopify's CDN are rewritten —
 * nothing else can be resized from here.
 */

/**
 * The two shapes a Shopify CDN URL takes on a storefront: the shared host
 * (`cdn.shopify.com/s/files/…`, what the Files API hands back) and the shop's
 * own domain fronting the same CDN (`loja.com/cdn/shop/…`, what themes emit).
 * Both accept the same resize parameters.
 */
const CDN_URL = /^(?:https?:)?\/\/(?:cdn\.shopify\.com\/s\/files\/|[^/?#]+\/cdn\/shop\/)/i;

/** Widths offered in `srcset`. The CDN never upscales, so a width beyond the original costs nothing. */
export const SRCSET_WIDTHS = [360, 540, 720, 900, 1080, 1296, 1512, 1728, 2048] as const;

/** The `src` older browsers fetch: enough for a laptop, not a wall. */
export const DEFAULT_SRC_WIDTH = 1080;

/** Beyond this nobody is looking at a product page; the CDN allows more. */
const MAX_WIDTH = 2048;

export function isShopifyCdn(url: string): boolean {
  return CDN_URL.test(url.trim());
}

/**
 * Formats the CDN does not resize (SVG is vector; a resized GIF loses its
 * animation). A `srcset` for them is nine URLs that all return the same
 * file — bytes in the page for nothing.
 */
function isUnresizable(url: string): boolean {
  const path = url.trim().split(/[?#]/)[0];
  return /\.(?:svg|gif)$/i.test(path);
}

/**
 * Narrower than this, an image is not the page's main picture: a logo, a
 * badge, a trust icon — and a page that opens with one of those is common.
 * Crowning it the LCP candidate would leave the real hero lazy, which is
 * exactly the failure the field data of 21/09 showed.
 */
export const HERO_MIN_WIDTH = 300;

/** What the page decided about an image, in document order. */
export type ImageRole = 'hero' | 'before-hero' | 'after-hero';

export interface ImageClaim {
  src: string;
  srcset?: string;
  sizes?: string;
  /** Declared width in CSS pixels, when the author gave one. */
  width?: number;
}

/**
 * Can this image be the hero? Not a small one, and not an inline `data:`
 * placeholder (nothing to fetch early).
 */
export function isHeroCandidate(image: ImageClaim): boolean {
  if (/^data:/i.test(image.src.trim())) return false;
  return image.width === undefined || image.width >= HERO_MIN_WIDTH;
}

/** True when the URL already carries the author's own sizing decisions. */
export function isAuthorSized(url: string): boolean {
  return /[?&](?:width|height|crop)=/i.test(url);
}

/** The same URL asking the CDN for `width` pixels. Other parameters survive. */
export function cdnWidth(url: string, width: number): string {
  const trimmed = url.trim();
  const hashAt = trimmed.indexOf('#');
  const noHash = hashAt === -1 ? trimmed : trimmed.slice(0, hashAt);
  const queryAt = noHash.indexOf('?');
  const path = queryAt === -1 ? noHash : noHash.slice(0, queryAt);
  const params = new URLSearchParams(queryAt === -1 ? '' : noHash.slice(queryAt + 1));
  params.set('width', String(Math.round(width)));
  return `${path}?${params.toString()}`;
}

export interface ResponsiveImage {
  src: string;
  srcset: string;
  sizes: string;
}

/**
 * `src`/`srcset`/`sizes` for a CDN image, or null when there is nothing safe
 * to do (not on the CDN, or already sized by the author).
 *
 * With a declared width the candidates stop at twice it — 2× is a retina
 * screen, 3× is bandwidth for nothing — and `sizes` tells the browser the
 * image never grows past that width. Without one, the image is assumed to
 * span the viewport, which is what a hero does.
 */
export function responsiveImage(
  src: string,
  options: { width?: number; sizes?: string } = {},
): ResponsiveImage | null {
  const url = src.trim();
  if (!isShopifyCdn(url) || isAuthorSized(url) || isUnresizable(url)) return null;

  const declared = options.width && options.width > 0 ? Math.round(options.width) : undefined;
  const cap = declared ? declared * 2 : MAX_WIDTH;
  const extra = declared ? [declared, declared * 2] : [];
  const widths = [...new Set<number>([...SRCSET_WIDTHS, ...extra])]
    .filter((w) => w <= cap && w <= MAX_WIDTH)
    .sort((a, b) => a - b);
  if (widths.length === 0) return null;

  const fallback = widths.includes(DEFAULT_SRC_WIDTH) ? DEFAULT_SRC_WIDTH : widths[widths.length - 1];
  const sizes = options.sizes?.trim() || (declared ? `(min-width: ${declared}px) ${declared}px, 100vw` : '100vw');
  return {
    src: cdnWidth(url, fallback),
    srcset: widths.map((w) => `${cdnWidth(url, w)} ${w}w`).join(', '),
    sizes,
  };
}

/**
 * Hosts that serve sample pictures, not the merchant's. One of them
 * (`via.placeholder.com`) was found on a live product page on 21/09: eight of
 * its ten images, and the host had gone dark — eight requests every phone
 * waited out before giving up. A template's example image is an unfinished
 * page, and the editor should say so before the visitor finds out.
 */
const PLACEHOLDER_HOSTS = [
  'via.placeholder.com',
  'placeholder.com',
  'placehold.it',
  'placehold.co',
  'placekitten.com',
  'dummyimage.com',
  'picsum.photos',
  'loremflickr.com',
  'unsplash.it',
  'fakeimg.pl',
];

/** The placeholder service a URL points at, or null for a real image. */
export function placeholderHost(url: string): string | null {
  const match = /^(?:https?:)?\/\/([^/?#]+)/i.exec(url.trim());
  if (!match) return null;
  const host = match[1].toLowerCase();
  return PLACEHOLDER_HOSTS.find((h) => host === h || host.endsWith(`.${h}`)) ?? null;
}

/** An image the browser can be told to fetch before it finds the tag. */
export interface LcpImage {
  src: string;
  srcset?: string;
  sizes?: string;
}

/** True for a URL a `<link rel="preload">` can name: absolute, or protocol-relative. */
export function isPreloadable(url: string): boolean {
  return /^(?:https?:)?\/\//i.test(url.trim()) || url.trim().startsWith('/');
}
