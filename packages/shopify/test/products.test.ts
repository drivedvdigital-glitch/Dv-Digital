import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ShopifyClient } from '../src/client.ts';
import { swapProductHandles } from '../src/products.ts';

/** A store with products by id → handle; handles unique, like Shopify's. */
function fakeStore(initial: Record<string, string>, failOn?: (id: string, handle: string, n: number) => boolean) {
  const handles = { ...initial };
  const writes: Array<[string, string]> = [];
  const client = {
    domain: 'loja.myshopify.com',
    async graphql(query: string, variables: Record<string, any>) {
      if (/DvflyProductHandle\(/.test(query)) {
        const h = handles[variables.id];
        return { product: h ? { handle: h } : null };
      }
      if (/DvflyProductHandleSet/.test(query)) {
        const { id, handle, redirectNewHandle } = variables.product;
        assert.equal(redirectNewHandle, false);
        if (failOn?.(id, handle, writes.length)) return { productUpdate: { product: null, userErrors: [{ message: 'falha simulada' }] } };
        if (Object.entries(handles).some(([other, h]) => other !== id && h === handle)) {
          return { productUpdate: { product: null, userErrors: [{ field: ['handle'], message: 'Handle has already been taken' }] } };
        }
        handles[id] = handle;
        writes.push([id, handle]);
        return { productUpdate: { product: { id, handle }, userErrors: [] } };
      }
      throw new Error(query.slice(0, 40));
    },
  } as unknown as ShopifyClient;
  return { client, handles, writes };
}

describe('swapProductHandles', () => {
  it('swaps the two URLs through a temporary handle', async () => {
    const { client, handles, writes } = fakeStore({ e: 'cinta-led', w: 'cinta-led-2', x: 'outro' });
    await swapProductHandles(client, { id: 'e', handle: 'cinta-led' }, { id: 'w', handle: 'cinta-led-2' });
    assert.deepEqual(handles, { e: 'cinta-led-2', w: 'cinta-led', x: 'outro' });
    assert.equal(writes.length, 3);
    assert.match(writes[0][1], /^cinta-led-dvfly-troca-/);
  });

  it('a failure in the middle is undone: both products end where they started', async () => {
    const { client, handles } = fakeStore({ e: 'cinta-led', w: 'cinta-led-2' }, (id, _h, n) => n === 2 && id === 'e');
    await assert.rejects(
      swapProductHandles(client, { id: 'e', handle: 'cinta-led' }, { id: 'w', handle: 'cinta-led-2' }),
      /foi desfeita/,
    );
    assert.deepEqual(handles, { e: 'cinta-led', w: 'cinta-led-2' });
  });

  it('refuses before writing anything when a handle is not what was expected', async () => {
    const { client, writes } = fakeStore({ e: 'cinta-led-novo', w: 'cinta-led-2' });
    await assert.rejects(
      swapProductHandles(client, { id: 'e', handle: 'cinta-led' }, { id: 'w', handle: 'cinta-led-2' }),
      /Nada foi trocado/,
    );
    assert.equal(writes.length, 0);
  });
});
