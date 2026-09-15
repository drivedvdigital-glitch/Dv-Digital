import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { ShopifyClient, ShopifyError } from '../src/client.ts';

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> };

/** Replaces global fetch with a scripted sequence of replies and records calls. */
function scriptFetch(replies: Reply[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const reply = replies.shift() ?? { status: 500, body: 'script exhausted' };
    const text = typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body ?? {});
    return new Response(text, { status: reply.status ?? 200, headers: reply.headers ?? {} });
  }) as typeof fetch;
  return calls;
}

const TOKEN = { access_token: 'tok', expires_in: 86399 };
const credentials = { domain: 'x.myshopify.com', clientId: 'id', clientSecret: 'secret' };

describe('ShopifyClient', () => {
  const realFetch = globalThis.fetch;
  let realWarn: typeof console.warn;
  beforeEach(() => {
    realWarn = console.warn;
    console.warn = () => {};
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    console.warn = realWarn;
  });

  it('mints one token and reuses it across calls', async () => {
    const calls = scriptFetch([
      { body: TOKEN },
      { body: { data: { shop: { name: 'A' } } } },
      { body: { data: { shop: { name: 'A' } } } },
    ]);
    const client = new ShopifyClient(credentials);
    assert.equal(await client.shopName(), 'A');
    assert.equal(await client.shopName(), 'A');
    assert.equal(calls.filter((c) => c.url.includes('/oauth/access_token')).length, 1);
    assert.match(calls[1].url, /\/admin\/api\/2026-07\/graphql\.json$/);
    assert.equal((calls[1].init.headers as Record<string, string>)['X-Shopify-Access-Token'], 'tok');
  });

  it('pins the API version it was given', async () => {
    const calls = scriptFetch([{ body: TOKEN }, { body: { data: { shop: { name: 'A' } } } }]);
    await new ShopifyClient({ ...credentials, apiVersion: '2026-10' }).shopName();
    assert.match(calls[1].url, /\/admin\/api\/2026-10\//);
  });

  it('retries a THROTTLED answer, waiting what the bucket needs', async () => {
    const calls = scriptFetch([
      { body: TOKEN },
      {
        body: {
          errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }],
          extensions: { cost: { requestedQueryCost: 10, throttleStatus: { currentlyAvailable: 0, restoreRate: 100 } } },
        },
      },
      { body: { data: { shop: { name: 'A' } } } },
    ]);
    const started = Date.now();
    assert.equal(await new ShopifyClient(credentials).shopName(), 'A');
    assert.equal(calls.length, 3);
    assert.ok(Date.now() - started >= 100, 'waited for the bucket to refill');
  });

  it('retries HTTP 429 honouring Retry-After and gives up after the bound', async () => {
    const throttled = { status: 429, body: 'slow down', headers: { 'retry-after': '0.01' } };
    scriptFetch([{ body: TOKEN }, throttled, throttled, throttled, throttled]);
    await assert.rejects(
      () => new ShopifyClient(credentials).shopName(),
      (error: unknown) => error instanceof ShopifyError && error.detail.status === 429,
    );
  });

  it('turns a non-JSON 200 into a ShopifyError instead of a SyntaxError', async () => {
    scriptFetch([{ body: TOKEN }, { body: '<html>bot check</html>' }]);
    await assert.rejects(
      () => new ShopifyClient(credentials).shopName(),
      (error: unknown) => error instanceof ShopifyError && /ilegível/.test(error.message),
    );
  });

  it('warns once when Shopify serves a different API version than requested', async () => {
    const warnings: string[] = [];
    console.warn = (message: string) => warnings.push(message);
    scriptFetch([
      { body: TOKEN },
      { body: { data: { shop: { name: 'A' } } }, headers: { 'x-shopify-api-version': '2026-01' } },
      { body: { data: { shop: { name: 'A' } } }, headers: { 'x-shopify-api-version': '2026-01' } },
    ]);
    const client = new ShopifyClient(credentials);
    await client.shopName();
    await client.shopName();
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /2026-01/);
  });

  it('classifies access-denied and not-found refusals', () => {
    const denied = new ShopifyError('x', { errors: [{ message: 'Access denied for themeFilesUpsert' }] });
    const missing = new ShopifyError('x', { userErrors: [{ code: 'NOT_FOUND', message: 'Page not found' }] });
    assert.equal(denied.isAccessDenied, true);
    assert.equal(denied.isNotFound, false);
    assert.equal(missing.isNotFound, true);
  });
});
