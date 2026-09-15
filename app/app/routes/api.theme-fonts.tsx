import { db } from '../lib/db.server.ts';

/**
 * Resolves the store theme's font variables by reading the live storefront.
 *
 * The style vocabulary's font tokens compile to `var(--font-body-family)` /
 * `var(--font-heading-family)` — the OS 2.0 convention. This route answers
 * what those variables resolve to TODAY on the first registered store, so the
 * editor can (a) label the tokens with the real font name, the way the
 * reference shows "token (font)", and (b) feed the same values into the
 * canvas so the preview renders with the theme's actual typography.
 *
 * Best-effort by design: no store, no network, no match → nulls, and the
 * editor simply shows the tokens without the resolved names.
 */
let cache: { at: number; data: { body: string | null; heading: string | null } } | null = null;

export async function loader() {
  if (cache && Date.now() - cache.at < 10 * 60 * 1000) return Response.json(cache.data);

  const data: { body: string | null; heading: string | null } = { body: null, heading: null };
  const store = await db.store.findFirst({ orderBy: { createdAt: 'asc' } });
  if (store) {
    try {
      const response = await fetch(`https://${store.domain}/`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DVFly editor)', Accept: 'text/html' },
        signal: AbortSignal.timeout(6000),
      });
      const html = await response.text();
      const read = (name: string) => {
        const match = new RegExp(`${name}:\\s*([^;}]+)`).exec(html);
        return match ? match[1].trim() : null;
      };
      data.body = read('--font-body-family');
      data.heading = read('--font-heading-family');
    } catch {
      // Storefront unreachable — tokens still work, just unlabeled.
    }
  }
  cache = { at: Date.now(), data };
  return Response.json(data);
}
