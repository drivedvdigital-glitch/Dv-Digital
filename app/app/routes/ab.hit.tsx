import type { ActionFunctionArgs } from 'react-router';

import { recordHit } from '../lib/ab.server.ts';

/**
 * Arrival report from a test URL on the storefront (split.ts sends it with
 * `navigator.sendBeacon` just before redirecting).
 *
 * Outside `requireShop` by design, like the webhooks: the caller is a
 * visitor's browser on the store, with no Shopify token and no business
 * having one. What it can do is bounded to exactly this — add one to a
 * counter of a test that is live, with a per-IP limit — and it answers the
 * same empty 204 whatever happened, so it tells a prober nothing.
 *
 * A resource route (no component), which React Router does not run its
 * same-origin action check on: the beacon comes from the store's domain.
 */
const ID = /^[a-z0-9]{1,40}$/i;

const empty = () =>
  new Response(null, {
    status: 204,
    headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
  });

export async function action({ request }: ActionFunctionArgs) {
  let body: { t?: unknown; v?: unknown; f?: unknown };
  try {
    const text = await request.text();
    if (text.length > 500) return empty();
    body = JSON.parse(text);
  } catch {
    return empty();
  }
  const testId = typeof body.t === 'string' ? body.t : '';
  const variantId = typeof body.v === 'string' ? body.v : '';
  if (!ID.test(testId) || !ID.test(variantId)) return empty();
  try {
    await recordHit({
      testId,
      variantId,
      first: body.f === 1,
      userAgent: request.headers.get('user-agent') ?? '',
      ip: (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local',
    });
  } catch (error) {
    // A database hiccup must not turn into an error page in a visitor's console.
    console.error('[dvfly] contagem do teste A|B falhou:', error instanceof Error ? error.message : error);
  }
  return empty();
}

export function loader() {
  return new Response('Use POST.', { status: 405, headers: { Allow: 'POST' } });
}
