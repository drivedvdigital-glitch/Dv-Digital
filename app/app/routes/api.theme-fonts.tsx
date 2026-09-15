import type { LoaderFunctionArgs } from 'react-router';

import { db } from '../lib/db.server.ts';
import { SHOP_DOMAIN } from '../lib/shopify.server.ts';

/**
 * Resolves the store theme's font variables by reading the live storefront.
 *
 * The style vocabulary's font tokens compile to `var(--font-body-family)` /
 * `var(--font-heading-family)` — the OS 2.0 convention. This route answers
 * what those variables resolve to TODAY on the store the editor was opened
 * from (`?shop=`; the first registered store when absent), so the editor can
 * (a) label the tokens with the real font name, the way the reference shows
 * "token (font)", and (b) feed the same values into the canvas so the preview
 * renders with the theme's actual typography.
 *
 * Best-effort by design: no store, no network, no match → nulls, and the
 * editor simply shows the tokens without the resolved names.
 */
type Fonts = { body: string | null; heading: string | null };

const TTL_MS = 10 * 60 * 1000;
/** Storefront HTML is scanned only this far; the variables sit in the head. */
const SCAN_LIMIT = 512 * 1024;

const cache = new Map<string, { at: number; data: Fonts }>();

export async function loader({ request }: LoaderFunctionArgs) {
  const wanted = new URL(request.url).searchParams.get('shop')?.toLowerCase() ?? '';
  const store = SHOP_DOMAIN.test(wanted)
    ? await db.store.findUnique({ where: { domain: wanted } })
    : await db.store.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!store) return Response.json({ body: null, heading: null } satisfies Fonts);

  const hit = cache.get(store.domain);
  if (hit && Date.now() - hit.at < TTL_MS) return Response.json(hit.data);

  const data: Fonts = { body: null, heading: null };
  try {
    const response = await fetch(`https://${store.domain}/`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DVFly editor)', Accept: 'text/html' },
      signal: AbortSignal.timeout(6000),
    });
    const html = (await response.text()).slice(0, SCAN_LIMIT);
    const read = (name: string) => {
      const match = new RegExp(`${name}:\\s*([^;}]+)`).exec(html);
      return match ? match[1].trim() : null;
    };
    data.body = read('--font-body-family');
    data.heading = read('--font-heading-family');
  } catch {
    // Storefront unreachable — tokens still work, just unlabeled.
  }
  cache.set(store.domain, { at: Date.now(), data });
  return Response.json(data);
}
