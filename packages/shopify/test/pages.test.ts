import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ShopifyClient } from '../src/client.ts';
import { ShopifyError } from '../src/client.ts';
import { findPageByHandle, upsertPage } from '../src/pages.ts';
import { deployPage, ProductionNotAllowedError } from '../src/deploy.ts';

const page = (id: string, handle: string) => ({
  id,
  title: handle,
  handle,
  isPublished: true,
  publishedAt: null,
  updatedAt: '',
  templateSuffix: null,
});

/** A client whose graphql() answers by operation name and records what ran. */
function fakeClient(answers: Record<string, (variables: Record<string, unknown>) => unknown>) {
  const ran: Array<{ op: string; variables: Record<string, unknown> }> = [];
  const client = {
    domain: 'x.myshopify.com',
    async graphql(query: string, variables: Record<string, unknown> = {}) {
      const op = /(?:mutation|query)\s+(\w+)/.exec(query)?.[1] ?? query.trim().slice(0, 20);
      ran.push({ op, variables });
      const answer = answers[op];
      if (!answer) throw new Error(`no scripted answer for ${op}`);
      const value = answer(variables);
      if (value instanceof Error) throw value;
      return value;
    },
  } as unknown as ShopifyClient;
  return { client, ran };
}

describe('findPageByHandle', () => {
  it('picks the exact handle out of the ranked batch', async () => {
    const { client, ran } = fakeClient({
      DvflyFindPage: () => ({ pages: { nodes: [page('2', 'promo-2'), page('1', 'promo')] } }),
    });
    const found = await findPageByHandle(client, 'promo');
    assert.equal(found?.id, '1');
    assert.equal(ran[0].variables.query, 'handle:promo');
  });
});

describe('upsertPage', () => {
  const input = { title: 'T', body: '<p>x</p>', handle: 'novo' };

  it('updates by the remembered id, never searching — a rename keeps the page', async () => {
    const { client, ran } = fakeClient({
      DvflyPageUpdate: (v) => ({ pageUpdate: { page: page(String(v.id), 'novo'), userErrors: [] } }),
    });
    const result = await upsertPage(client, input, 'gid://shopify/Page/7');
    assert.equal(result.created, false);
    assert.equal(result.page.id, 'gid://shopify/Page/7');
    assert.deepEqual(ran.map((r) => r.op), ['DvflyPageUpdate']);
    assert.equal((ran[0].variables.page as { redirectNewHandle: boolean }).redirectNewHandle, true);
  });

  it('falls back to the handle when the remembered id is gone from the store', async () => {
    const { client, ran } = fakeClient({
      DvflyPageUpdate: (v) =>
        v.id === 'gid://gone'
          ? { pageUpdate: { page: null, userErrors: [{ code: 'NOT_FOUND', message: 'Page not found' }] } }
          : { pageUpdate: { page: page(String(v.id), 'novo'), userErrors: [] } },
      DvflyFindPage: () => ({ pages: { nodes: [page('gid://byhandle', 'novo')] } }),
    });
    const result = await upsertPage(client, input, 'gid://gone');
    assert.equal(result.page.id, 'gid://byhandle');
    assert.deepEqual(ran.map((r) => r.op), ['DvflyPageUpdate', 'DvflyFindPage', 'DvflyPageUpdate']);
  });

  it('creates when neither id nor handle exists', async () => {
    const { client, ran } = fakeClient({
      DvflyFindPage: () => ({ pages: { nodes: [] } }),
      DvflyPageCreate: () => ({ pageCreate: { page: page('gid://new', 'novo'), userErrors: [] } }),
    });
    const result = await upsertPage(client, input);
    assert.equal(result.created, true);
    assert.deepEqual(ran.map((r) => r.op), ['DvflyFindPage', 'DvflyPageCreate']);
  });

  it('propagates a refusal that is not "not found"', async () => {
    const { client } = fakeClient({
      DvflyPageUpdate: () => ({ pageUpdate: { page: null, userErrors: [{ message: 'Access denied' }] } }),
    });
    await assert.rejects(() => upsertPage(client, input, 'gid://x'), ShopifyError);
  });
});

describe('deployPage', () => {
  const stores = [
    { domain: 'a.myshopify.com', clientId: 'i', clientSecret: 's', label: 'A' },
    { domain: 'b.myshopify.com', clientId: 'i', clientSecret: 's', label: 'B', isProduction: true },
  ];

  it('refuses production stores without the explicit opt-in', async () => {
    await assert.rejects(
      () => deployPage(stores, { title: 'T', body: '', handle: 'h' }),
      ProductionNotAllowedError,
    );
  });

  it('isolates stores: one failing does not stop the other, and ids are used per store', async () => {
    const clients: Record<string, ReturnType<typeof fakeClient>> = {
      'a.myshopify.com': fakeClient({
        DvflyPageUpdate: (v) => ({ pageUpdate: { page: page(String(v.id), 'h'), userErrors: [] } }),
      }),
      'b.myshopify.com': fakeClient({
        DvflyFindPage: () => new ShopifyError('GraphQL HTTP 500 em b.myshopify.com', { status: 500 }),
      }),
    };
    const result = await deployPage(
      stores,
      { title: 'T', body: '', handle: 'h' },
      {
        allowProduction: true,
        publish: true,
        existingIds: { 'a.myshopify.com': 'gid://a/1' },
        clientFor: (store) => clients[store.domain].client,
      },
    );
    assert.equal(result.succeeded.length, 1);
    assert.equal(result.succeeded[0].page?.id, 'gid://a/1');
    assert.equal(result.failed.length, 1);
    assert.match(result.failed[0].error ?? '', /HTTP 500/);
    assert.deepEqual(clients['a.myshopify.com'].ran.map((r) => r.op), ['DvflyPageUpdate']);
  });
});
