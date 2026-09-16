import { db } from './db.server.ts';
import { SHOP_DOMAIN } from './shopify.server.ts';

/**
 * The store theme's own styling, read from the live storefront.
 *
 * Both places that show a page before it is published need it, for the same
 * reason: a page rendered without the theme is not the page the visitor gets.
 * Measured on 16/09, one page showed 470 computed-style differences between a
 * bare document and the storefront — the theme's font, its heading scale, its
 * `hr{margin:7rem 0}`. With the theme loaded, 0.
 *
 * What comes back is the merchant's own storefront, at the trust level of their
 * own theme: stylesheet URLs (https only — no scripts, ever) and the CSS
 * Shopify itself marks as theme-generated (`<style data-shopify>`, which is
 * where the theme settings live).
 *
 * Best-effort by design: no store, no network, no match → empty fields, and the
 * caller renders what it renders today.
 */
export interface ThemeStyle {
  body: string | null;
  heading: string | null;
  /** Absolute https URLs of the theme's stylesheets, in document order. */
  links: string[];
  /** Theme-generated CSS from the storefront's head (the settings block). */
  css: string;
}

export const EMPTY_THEME_STYLE: ThemeStyle = { body: null, heading: null, links: [], css: '' };

const TTL_MS = 10 * 60 * 1000;
/** Storefront HTML is scanned only this far; everything we read is in the head. */
const SCAN_LIMIT = 512 * 1024;
/** Enough for any theme's settings block; a runaway page cannot flood the editor. */
const CSS_LIMIT = 128 * 1024;
const MAX_LINKS = 12;

const cache = new Map<string, { at: number; data: ThemeStyle }>();

/** Picks the store the editor was opened from, or the first one registered. */
export async function storeForThemeStyle(shop: string | null) {
  const wanted = shop?.toLowerCase() ?? '';
  return SHOP_DOMAIN.test(wanted)
    ? await db.store.findUnique({ where: { domain: wanted } })
    : await db.store.findFirst({ orderBy: { createdAt: 'asc' } });
}

export async function readThemeStyle(domain: string | undefined | null): Promise<ThemeStyle> {
  if (!domain) return EMPTY_THEME_STYLE;
  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const data: ThemeStyle = { body: null, heading: null, links: [], css: '' };
  try {
    const response = await fetch(`https://${domain}/`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DVFly editor)', Accept: 'text/html' },
      signal: AbortSignal.timeout(6000),
    });
    const html = (await response.text()).slice(0, SCAN_LIMIT);
    const headEnd = html.indexOf('</head>');
    const head = headEnd === -1 ? html : html.slice(0, headEnd);

    const read = (name: string) => {
      const match = new RegExp(`${name}:\\s*([^;}]+)`).exec(html);
      return match ? match[1].trim() : null;
    };
    data.body = read('--font-body-family');
    data.heading = read('--font-heading-family');

    for (const tag of head.matchAll(/<link\b[^>]*>/gi)) {
      if (!/rel\s*=\s*["']?stylesheet/i.test(tag[0])) continue;
      const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag[0])?.[1];
      if (!href) continue;
      try {
        // A protocol-relative href ("//cdn.shopify.com/…") is the common shape.
        const url = new URL(href, `https://${domain}/`);
        if (url.protocol !== 'https:') continue;
        if (!data.links.includes(url.href)) data.links.push(url.href);
      } catch {
        // Unparseable href: skip it rather than ship a broken tag.
      }
      if (data.links.length >= MAX_LINKS) break;
    }

    const blocks: string[] = [];
    for (const block of head.matchAll(/<style\b[^>]*\bdata-shopify\b[^>]*>([\s\S]*?)<\/style>/gi)) {
      blocks.push(block[1]);
    }
    // It came from inside a <style>, so it cannot carry a closing tag — but
    // this text is written into a document, and that is not a place to assume.
    data.css = blocks.join('\n').replace(/<\/style/gi, '<\\/style').slice(0, CSS_LIMIT);
  } catch {
    // Storefront unreachable — everything still works, just without the theme.
  }
  cache.set(domain, { at: Date.now(), data });
  return data;
}
