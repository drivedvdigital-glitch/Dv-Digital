import type { ActionFunctionArgs } from 'react-router';

import { verifyWebhookHmac } from '../../../packages/shopify/src/session.ts';
import { db } from '../lib/db.server.ts';
import { appCredentials } from '../lib/shopify.server.ts';

/**
 * Webhooks Shopify sends the app (declared in shopify.app.toml):
 *
 *   /webhooks/app         app/uninstalled, app/scopes_update
 *   /webhooks/compliance  customers/data_request, customers/redact, shop/redact
 *
 * Every delivery is checked against the HMAC of the raw body before anything
 * is read from it; a bad signature gets 401, as the compliance rules require.
 * Handlers answer fast (Shopify allows five seconds) and are idempotent —
 * a redelivery changes nothing.
 */
export async function action({ request, params }: ActionFunctionArgs) {
  const raw = await request.text();
  const credentials = await appCredentials();
  if (!credentials || !verifyWebhookHmac(raw, request.headers.get('x-shopify-hmac-sha256'), credentials.clientSecret)) {
    return new Response('assinatura inválida', { status: 401 });
  }

  const topic = request.headers.get('x-shopify-topic') ?? '';
  const domain = (request.headers.get('x-shopify-shop-domain') ?? '').toLowerCase();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    // Some topics carry an empty body; the headers say what happened.
  }

  if (params.topic === 'app') {
    if (topic === 'app/uninstalled' && domain) {
      // The token is dead the moment the app is removed. The row stays, so
      // pages keep their deployment history; nothing is deleted on the
      // store's side (its content survives the app — invariant I4).
      await db.store.updateMany({
        where: { domain },
        data: { accessToken: null, scopes: null, uninstalledAt: new Date() },
      });
      await db.deployment.updateMany({
        where: { store: { domain } },
        data: { isPublished: false },
      });
    }
    if (topic === 'app/scopes_update' && domain) {
      const current = payload.current;
      await db.store.updateMany({
        where: { domain },
        data: { scopes: Array.isArray(current) ? current.join(',') : null },
      });
    }
    return new Response(null, { status: 200 });
  }

  if (params.topic === 'compliance') {
    // The app stores no customer data: a data request has nothing to return
    // and a customer redaction nothing to delete. A shop redaction (48h after
    // uninstall) removes what the app knows about the store.
    if (topic === 'shop/redact' && domain) {
      await db.store.deleteMany({ where: { domain } });
    }
    return new Response(null, { status: 200 });
  }

  return new Response('tópico desconhecido', { status: 404 });
}

/** Shopify only POSTs; anything else is a curious browser. */
export function loader() {
  return new Response('método não permitido', { status: 405 });
}
