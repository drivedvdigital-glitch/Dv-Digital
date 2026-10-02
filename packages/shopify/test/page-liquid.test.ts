import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LIQUID_CLOSE, LIQUID_OPEN } from '../../compiler/src/liquid.ts';
import type { ShopifyClient } from '../src/client.ts';
import { deployPage } from '../src/deploy.ts';
import { pageLiquidSuffix, pageLiquidTemplate, pageSectionLiquid } from '../src/templates.ts';

/** A store that keeps theme files and pages in memory. */
function fakeStore() {
  const theme = new Map<string, string>();
  const pages: Array<{ id: string; handle: string; title: string; templateSuffix: string | null; body?: string }> = [];
  const client = {
    domain: 'loja.myshopify.com',
    async graphql(query: string, variables: Record<string, any> = {}) {
      if (/roles: \[MAIN\]/.test(query)) return { themes: { nodes: [{ id: 'gid://shopify/OnlineStoreTheme/1' }] } };
      if (/themeFilesUpsert/.test(query)) {
        for (const f of variables.files) theme.set(f.filename, f.body.value);
        return { themeFilesUpsert: { upsertedThemeFiles: variables.files.map((f: any) => ({ filename: f.filename })), userErrors: [] } };
      }
      if (/themeFilesDelete/.test(query)) {
        for (const f of variables.files) theme.delete(f);
        return { themeFilesDelete: { deletedThemeFiles: variables.files.map((filename: string) => ({ filename })), userErrors: [] } };
      }
      if (/DvflyFindPage/.test(query)) return { pages: { nodes: pages.filter((p) => `handle:${p.handle}` === variables.query) } };
      if (/DvflyPageCreate/.test(query)) {
        const page = { id: `gid://shopify/Page/${pages.length + 1}`, isPublished: true, ...variables.page };
        pages.push(page);
        return { pageCreate: { page, userErrors: [] } };
      }
      if (/DvflyPageUpdate/.test(query)) {
        const page = pages.find((p) => p.id === variables.id)!;
        Object.assign(page, variables.page);
        return { pageUpdate: { page, userErrors: [] } };
      }
      throw new Error(`unexpected query: ${query.slice(0, 60)}`);
    },
  } as unknown as ShopifyClient;
  return { client, theme, pages };
}

const store = { domain: 'loja.myshopify.com', label: 'Loja', clientId: 'a', clientSecret: 'b' } as never;

describe('regular page with Liquid', () => {
  const withLiquid = `<style>.a{}</style><div class="dvf-page"><div data-dvf-raw="">${LIQUID_OPEN}{% include 'gtm-roteador' %}<h2>{{ nome_loja }}</h2>${LIQUID_CLOSE}</div></div>`;

  it('gets its own template, whose only section is the page with the Liquid out of raw', async () => {
    const { client, theme, pages } = fakeStore();
    const result = await deployPage(
      [store],
      { title: 'LP', handle: 'lp', body: 'corpo sem liquid' },
      { publish: true, clientFor: () => client, liquidPage: { pageId: 'CMP1', title: 'LP', fragment: withLiquid, chrome: true } },
    );
    assert.equal(result.failed.length, 0, JSON.stringify(result.failed));
    assert.equal(pages[0].templateSuffix, pageLiquidSuffix('CMP1'));
    const template = JSON.parse(theme.get('templates/page.dvfly-pg-cmp1.json')!);
    assert.deepEqual(template.order, ['dvfly']);
    assert.equal(template.sections.dvfly.type, 'dvfly-pg-cmp1');
    assert.equal(template.layout, undefined, 'theme layout: header and footer stay');
    const section = theme.get('sections/dvfly-pg-cmp1.liquid')!;
    assert.ok(section.includes("{% endraw %}{% include 'gtm-roteador' %}<h2>{{ nome_loja }}</h2>{% raw %}"), section);
    assert.ok(section.includes('"templates":["page"]'), section);
  });

  it('without the theme chrome, the template uses the bare layout', () => {
    const template = JSON.parse(pageLiquidTemplate({ pageId: 'x', title: 'x', fragment: '', chrome: false }));
    assert.equal(template.layout, 'theme.dvfly');
    assert.ok(pageSectionLiquid({ pageId: 'x', title: 'x', fragment: withLiquid, chrome: false }).includes('{{ nome_loja }}'));
  });

  it('losing its Liquid, the page goes back to the regular template and the files leave the theme', async () => {
    const { client, theme, pages } = fakeStore();
    const options = { publish: true, clientFor: () => client };
    await deployPage([store], { title: 'LP', handle: 'lp', body: 'x' }, { ...options, liquidPage: { pageId: 'CMP1', title: 'LP', fragment: withLiquid, chrome: true } });
    await deployPage(
      [store],
      { title: 'LP', handle: 'lp', body: 'x', templateSuffix: null },
      { ...options, liquidPage: { pageId: 'CMP1', title: 'LP', fragment: '<p>sem liquid</p>', chrome: true } },
    );
    assert.equal(pages.length, 1);
    assert.equal(pages[0].templateSuffix, null);
    assert.ok(![...theme.keys()].some((f) => f.includes('dvfly-pg-')), [...theme.keys()].join(', '));
  });
});
