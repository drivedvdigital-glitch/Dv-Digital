import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import vm from 'node:vm';

import { ShopifyError, type ShopifyClient } from '../src/client.ts';
import { ordersUpdatedSince } from '../src/orders.ts';
import { productStates, publicationDoubt, unreachableReason } from '../src/products.ts';
import {
  ensureEntryCopy,
  ensureSplitTemplate,
  entryCopyChanged,
  inspectVariantCanonicals,
  pointVariantCanonicals,
  releaseVariantCanonicals,
  removeSplitTemplate,
  splitLayoutLiquid,
  splitScript,
  splitSuffix,
  wrapLayout,
  type SplitInput,
} from '../src/split.ts';
import { canonicalAware, chromelessLayout, stripJsonComments } from '../src/templates.ts';

const INPUT: SplitInput = {
  testId: 'cmtest1',
  name: 'Pia de banho',
  hitUrl: 'https://app.example.com/ab/hit',
  variants: [
    { id: 'va', handle: 'piadebanho1', weight: 25 },
    { id: 'vb', handle: 'piadebanho2', weight: 25 },
    { id: 'vc', handle: 'piadebanho3', weight: 25 },
    { id: 'vd', handle: 'piadebanho4', weight: 25 },
  ],
};

/** Runs the entry-page script in a fake browser and says where it went. */
function run(
  input: SplitInput,
  opts: {
    random?: number;
    stored?: string | null;
    search?: string;
    path?: string;
    framed?: boolean;
    navigation?: string;
    referrer?: string;
  } = {},
) {
  const store = new Map<string, string>();
  if (opts.stored) store.set(`dvf_ab_${input.testId}`, opts.stored);
  const beacons: string[] = [];
  let replaced: string | null = null;
  const timers: number[] = [];
  const style: { visibility?: string } = {};
  const win: Record<string, unknown> = {};
  const location = {
    search: opts.search ?? '',
    hash: '#oferta',
    pathname: opts.path ?? '/products/piadebanho',
    protocol: 'https:',
    host: 'loja.example',
    replace: (url: string) => (replaced = url),
  };
  Object.assign(win, {
    location,
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
    navigator: { sendBeacon: (_url: string, body: string) => (beacons.push(body), true) },
    Math: { ...Math, random: () => opts.random ?? 0 },
    JSON,
    document: { documentElement: { style }, referrer: opts.referrer ?? '' },
    performance: { getEntriesByType: () => [{ type: opts.navigation ?? 'navigate' }] },
    setTimeout: (_fn: () => void, ms: number) => timers.push(ms),
  });
  win.window = win;
  win.self = win;
  win.top = opts.framed ? {} : win;
  const code = splitScript(input).replace(/^<script>|<\/script>$/g, '');
  vm.runInNewContext(code, win);
  return {
    replaced,
    beacons: beacons.map((b) => JSON.parse(b)),
    stored: store.get(`dvf_ab_${input.testId}`),
    hidden: style.visibility === 'hidden',
    timers,
  };
}

describe('A/B split script', () => {
  it('picks by weight: the random number falls into one band of the percentages', () => {
    assert.equal(run(INPUT, { random: 0 }).replaced, '/products/piadebanho1#oferta');
    assert.equal(run(INPUT, { random: 0.3 }).replaced, '/products/piadebanho2#oferta');
    assert.equal(run(INPUT, { random: 0.6 }).replaced, '/products/piadebanho3#oferta');
    assert.equal(run(INPUT, { random: 0.99 }).replaced, '/products/piadebanho4#oferta');
  });

  it('never sends anyone to a variant weighted 0', () => {
    const input = { ...INPUT, variants: INPUT.variants.map((v, i) => ({ ...v, weight: i === 1 ? 100 : 0 })) };
    for (const random of [0, 0.25, 0.5, 0.999]) {
      assert.equal(run(input, { random }).replaced, '/products/piadebanho2#oferta');
    }
  });

  it('keeps the query string (utm, fbclid) and the locale prefix', () => {
    const r = run(INPUT, { search: '?utm_source=fb&fbclid=x1', path: '/es-co/products/piadebanho' });
    assert.equal(r.replaced, '/es-co/products/piadebanho1?utm_source=fb&fbclid=x1#oferta');
  });

  it('the same browser sees the same variant: first visit counts a visitor, the return does not', () => {
    const first = run(INPUT, { random: 0.6 });
    assert.equal(first.stored, 'vc');
    assert.deepEqual(first.beacons, [{ t: 'cmtest1', v: 'vc', f: 1 }]);
    const back = run(INPUT, { random: 0, stored: 'vc' });
    assert.equal(back.replaced, '/products/piadebanho3#oferta');
    assert.deepEqual(back.beacons, [{ t: 'cmtest1', v: 'vc', f: 0 }]);
  });

  it('a remembered variant that was switched off (weight 0) is drawn again', () => {
    const input = { ...INPUT, variants: INPUT.variants.map((v) => ({ ...v, weight: v.id === 'vc' ? 0 : 25 })) };
    const r = run(input, { random: 0, stored: 'vc' });
    assert.equal(r.replaced, '/products/piadebanho1#oferta');
    assert.equal(r.beacons[0].f, 1);
  });

  it('version A is the entry URL itself: same path, its own template through ?view=', () => {
    const input = { ...INPUT, variants: [{ id: 'va', handle: 'piadebanho', weight: 50, view: 'dvfly-pagina1' }, { id: 'vb', handle: 'piadebanho1', weight: 50 }] };
    assert.equal(run(input, { random: 0 }).replaced, '/products/piadebanho?view=dvfly-pagina1#oferta');
    assert.equal(run(input, { random: 0, search: '?fbclid=x1' }).replaced, '/products/piadebanho?fbclid=x1&view=dvfly-pagina1#oferta');
    assert.equal(run(input, { random: 0.9 }).replaced, '/products/piadebanho1#oferta');
    assert.match(splitLayoutLiquid(input), /content="0;url=\/products\/piadebanho\?view=dvfly-pagina1"/);
    assert.throws(() => splitScript({ ...input, variants: [{ ...input.variants[0], view: 'x"><script>' }, input.variants[1]] }), /Modelo inválido/);
  });

  it('version A on its own page (stay): counted, not redirected, not hidden; the others leave hidden', () => {
    const input = { ...INPUT, variants: [{ id: 'va', handle: 'piadebanho', weight: 50, stay: true }, { id: 'vb', handle: 'piadebanho1', weight: 50 }] };
    const a = run(input, { random: 0 });
    assert.equal(a.replaced, null);
    assert.equal(a.hidden, false);
    assert.deepEqual(a.beacons, [{ t: 'cmtest1', v: 'va', f: 1 }]);
    assert.equal(a.stored, 'va');
    const b = run(input, { random: 0.9, search: '?fbclid=x1' });
    assert.equal(b.replaced, '/products/piadebanho1?fbclid=x1#oferta');
    assert.equal(b.hidden, true);
    assert.deepEqual(b.timers, [3000]);
    // The same browser comes back to A and stays again.
    assert.equal(run(input, { random: 0.9, stored: 'va' }).replaced, null);
    assert.throws(() => splitScript({ ...input, variants: [{ ...input.variants[0], view: 'x' }, input.variants[1]] }), /não pode ficar/);
    assert.throws(() => splitScript({ ...input, variants: input.variants.map((v) => ({ ...v, stay: true })) }), /Só uma versão/);
  });

  it('counts arrivals from outside the store only: not a reload, a back/forward, or a link inside the store', () => {
    const input = { ...INPUT, variants: [{ id: 'va', handle: 'piadebanho', weight: 50, stay: true }, { id: 'vb', handle: 'piadebanho1', weight: 50 }] };
    assert.equal(run(input, { random: 0, stored: 'va' }).beacons.length, 1, 'an ad click (no referrer) counts');
    assert.equal(run(input, { random: 0, stored: 'va', referrer: 'https://l.facebook.com/' }).beacons.length, 1);
    assert.equal(run(input, { random: 0, stored: 'va', navigation: 'reload' }).beacons.length, 0, 'a reload of A does not');
    assert.equal(run(input, { random: 0, stored: 'va', navigation: 'back_forward' }).beacons.length, 0);
    assert.equal(run(input, { random: 0, stored: 'va', referrer: 'https://loja.example/cart' }).beacons.length, 0, 'the cart link does not');
    // Not counted, still sent where it belongs.
    assert.equal(run(input, { random: 0.9, stored: 'vb', navigation: 'reload' }).replaced, '/products/piadebanho1#oferta');
  });

  it('never loops: already on ?view=<the template drawn>, it stays', () => {
    const input = { ...INPUT, variants: [{ id: 'va', handle: 'piadebanho', weight: 100, view: 'apagado' }, { id: 'vb', handle: 'piadebanho1', weight: 0 }] };
    assert.equal(run(input).replaced, '/products/piadebanho?view=apagado#oferta');
    const again = run(input, { search: '?fbclid=1&view=apagado', stored: 'va' });
    assert.equal(again.replaced, null);
    assert.equal(again.hidden, false);
  });

  it('stays put with ?dvf_ab=off (to look at the entry page) and inside the theme editor', () => {
    assert.equal(run(INPUT, { search: '?dvf_ab=off' }).replaced, null);
    assert.equal(run(INPUT, { framed: true }).replaced, null);
  });

  it('refuses what could break out of the script or Liquid', () => {
    assert.throws(() => splitScript({ ...INPUT, variants: [{ id: 'va', handle: 'x</script>', weight: 1 }, INPUT.variants[1]] }));
    assert.throws(() => splitScript({ ...INPUT, variants: [INPUT.variants[0]] }), /pelo menos 2/);
    assert.throws(() => splitScript({ ...INPUT, variants: INPUT.variants.map((v) => ({ ...v, weight: 0 })) }), /peso maior que 0/);
    assert.throws(() => splitScript({ ...INPUT, hitUrl: 'http://app.example.com/ab/hit' }), /https/);
  });

  it('the layout puts the script before content_for_header, inside raw, with a no-JS fallback', () => {
    const liquid = splitLayoutLiquid(INPUT);
    const script = liquid.indexOf('<script>');
    assert.ok(script > 0 && script < liquid.indexOf('{{ content_for_header }}'));
    assert.ok(liquid.indexOf('{% raw %}') < script && liquid.indexOf('{% endraw %}') > script);
    assert.match(liquid, /<noscript><meta http-equiv="refresh" content="0;url=\/products\/piadebanho1"><\/noscript>/);
    assert.match(liquid, /\{\{ content_for_layout \}\}/);
  });
});

function fakeTheme() {
  const calls: Array<[string, string[]]> = [];
  const client = {
    domain: 'loja.myshopify.com',
    async graphql(query: string, variables: Record<string, unknown> = {}) {
      if (/themes\(first: 1, roles: \[MAIN\]\)/.test(query)) return { themes: { nodes: [{ id: 'gid://shopify/OnlineStoreTheme/1' }] } };
      if (/themeFilesUpsert/.test(query)) {
        const files = variables.files as Array<{ filename: string }>;
        calls.push(['upsert', files.map((f) => f.filename)]);
        return { themeFilesUpsert: { upsertedThemeFiles: files.map((f) => ({ filename: f.filename })), userErrors: [] } };
      }
      if (/themeFilesDelete/.test(query)) {
        const files = variables.files as string[];
        calls.push(['delete', files]);
        return { themeFilesDelete: { deletedThemeFiles: [], userErrors: [{ code: 'NOT_FOUND', message: 'not found' }] } };
      }
      throw new Error(`unexpected query: ${query.slice(0, 60)}`);
    },
  } as unknown as ShopifyClient;
  return { client, calls };
}

describe('A/B split theme files', () => {
  it('writes the layout first, alone; removes the template before the layout it names', async () => {
    const { client, calls } = fakeTheme();
    const { suffix } = await ensureSplitTemplate(client, INPUT);
    assert.equal(suffix, splitSuffix('cmtest1'));
    assert.equal(suffix, 'dvfly-ab-cmtest1');
    assert.deepEqual(calls, [
      ['upsert', ['layout/theme.dvfly-ab-cmtest1.liquid']],
      ['upsert', ['sections/dvfly-ab-cmtest1.liquid', 'templates/product.dvfly-ab-cmtest1.json']],
    ]);
    calls.length = 0;
    await removeSplitTemplate(client, 'cmtest1');
    assert.deepEqual(calls, [
      ['delete', ['templates/product.dvfly-ab-cmtest1.json', 'sections/dvfly-ab-cmtest1.liquid', 'templates/product.dvfly-ab-cmtest1-a.json', 'templates/product.dvfly-ab-cmtest1-a.liquid']],
      ['delete', ['layout/theme.dvfly-ab-cmtest1.liquid']],
    ]);
  });
});

describe('version A copy of the default product template', () => {
  it('copies product.json (comments stripped) under our suffix; removal takes it out', async () => {
    const files: Record<string, string> = { 'templates/product.json': '/* auto */ {"sections":{"main":{"type":"main-product"}},"order":["main"],}' };
    const deleted: string[] = [];
    const client = {
      domain: 'loja.myshopify.com',
      async graphql(query: string, variables: Record<string, unknown> = {}) {
        if (/roles: \[MAIN\]/.test(query)) return { themes: { nodes: [{ id: 't1' }] } };
        if (/themeFilesUpsert/.test(query)) {
          for (const f of variables.files as Array<{ filename: string; body: { value: string } }>) files[f.filename] = f.body.value;
          return { themeFilesUpsert: { upsertedThemeFiles: (variables.files as unknown[]).map(() => ({})), userErrors: [] } };
        }
        if (/themeFilesDelete/.test(query)) {
          deleted.push(...(variables.files as string[]));
          return { themeFilesDelete: { deletedThemeFiles: [], userErrors: [] } };
        }
        if (/DvflyThemeFiles/.test(query)) {
          const names = variables.filenames as string[];
          return { theme: { files: { nodes: names.filter((n) => files[n]).map((n) => ({ filename: n, body: { content: files[n] } })) } } };
        }
        throw new Error(query.slice(0, 50));
      },
    } as unknown as ShopifyClient;
    assert.equal(await ensureEntryCopy(client, 'cmtest1'), 'dvfly-ab-cmtest1-a');
    assert.deepEqual(JSON.parse(files['templates/product.dvfly-ab-cmtest1-a.json']).order, ['main']);
    await removeSplitTemplate(client, 'cmtest1');
    assert.ok(deleted.includes('templates/product.dvfly-ab-cmtest1-a.json'));
  });
});

describe('orders updated since', () => {
  const order = (id: string, updatedAt: string, products: Array<string | null>, extra: Partial<{ cancelledAt: string; test: boolean; amount: string }> = {}) => ({
    id,
    createdAt: '2026-10-01T15:00:00Z',
    updatedAt,
    cancelledAt: extra.cancelledAt ?? null,
    test: extra.test ?? false,
    totalPriceSet: { shopMoney: { amount: extra.amount ?? '100.00', currencyCode: 'COP' } },
    lineItems: { nodes: products.map((id) => ({ product: id ? { id } : null })) },
  });
  const fakeOrders = (pages: Array<{ nodes: unknown[]; next: string | null }>) => {
    const queries: Array<Record<string, unknown>> = [];
    const client = {
      domain: 'loja.myshopify.com',
      async graphql(_q: string, variables: Record<string, unknown>) {
        queries.push(variables);
        const page = pages[queries.length - 1];
        return { orders: { pageInfo: { hasNextPage: !!page.next, endCursor: page.next }, nodes: page.nodes } };
      },
    } as unknown as ShopifyClient;
    return { client, queries };
  };

  it('reads every page, flattens to id/dates/total/products, dedupes products', async () => {
    const { client, queries } = fakeOrders([
      { nodes: [order('o1', '2026-10-01T15:00:00Z', ['p1', 'p1', null])], next: 'c1' },
      { nodes: [order('o2', '2026-10-01T16:00:00Z', ['p2'], { cancelledAt: '2026-10-02T00:00:00Z', amount: '50' })], next: null },
    ]);
    const r = await ordersUpdatedSince(client, new Date('2026-10-01T00:00:00Z'));
    assert.equal(r.complete, true);
    assert.equal(queries[0].query, "updated_at:>='2026-10-01T00:00:00.000Z'");
    assert.equal(queries[1].after, 'c1');
    assert.deepEqual(r.orders.map((o) => [o.id, o.productIds, o.cancelled, o.total]), [
      ['o1', ['p1'], false, 100],
      ['o2', ['p2'], true, 50],
    ]);
  });

  it('stops at maxPages and says where to resume', async () => {
    const { client } = fakeOrders([
      { nodes: [order('o1', '2026-10-01T15:00:00Z', ['p1'])], next: 'c1' },
      { nodes: [order('o2', '2026-10-01T16:30:00Z', ['p1'])], next: 'c2' },
    ]);
    const r = await ordersUpdatedSince(client, new Date('2026-10-01T00:00:00Z'), { maxPages: 2 });
    assert.equal(r.complete, false);
    assert.equal(r.resumeFrom?.toISOString(), '2026-10-01T16:30:00.000Z');
    assert.equal(r.orders.length, 2);
  });

  it('turns an access refusal into the steps that fix it', async () => {
    const client = {
      domain: 'loja.myshopify.com',
      async graphql() {
        throw new ShopifyError('Access denied for orders field.', { errors: [{ message: 'Access denied for orders field.' }] });
      },
    } as unknown as ShopifyClient;
    await assert.rejects(ordersUpdatedSince(client, new Date()), /read_orders.*Instalar app/s);
  });
});

describe('wrapping a layout with the split', () => {
  const BLOCK = '<!--split-->';
  it('goes right after <meta charset>, before content_for_header', () => {
    const layout = '<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <title>x</title>\n  {{ content_for_header }}\n</head><body>{{ content_for_layout }}</body></html>';
    const out = wrapLayout(layout, BLOCK)!;
    assert.ok(out.indexOf(BLOCK) > out.indexOf('<meta charset') && out.indexOf(BLOCK) < out.indexOf('<title>'));
    assert.equal(out.replace(`\n${BLOCK}\n`, ''), layout);
  });

  it('without a charset tag: right after <head>; without <head>: just before content_for_header', () => {
    const noCharset = wrapLayout('<html><head class="x">\n{{- content_for_header -}}</head></html>', BLOCK)!;
    assert.ok(noCharset.startsWith(`<html><head class="x">\n${BLOCK}\n`));
    const bare = wrapLayout('{%- liquid x -%}{{ content_for_header }}<body></body>', BLOCK)!;
    assert.ok(bare.indexOf(BLOCK) < bare.indexOf('{{ content_for_header }}'));
  });

  it('a charset tag AFTER content_for_header does not count', () => {
    const out = wrapLayout('<head>{{ content_for_header }}<meta charset="utf-8"></head>', BLOCK)!;
    assert.ok(out.indexOf(BLOCK) < out.indexOf('{{ content_for_header }}'));
  });

  it('refuses a layout without content_for_header', () => {
    assert.equal(wrapLayout('<html><head></head></html>', BLOCK), null);
  });
});

/** An in-memory store: theme files, products with their metafields. */
function fakeStore(
  files: Record<string, string>,
  products: Array<{ id: string; handle: string; status?: string; online?: boolean; templateSuffix?: string | null; abEntry?: string | null }> = [],
) {
  const calls: string[] = [];
  const client = {
    domain: 'loja.myshopify.com',
    async graphql(query: string, variables: Record<string, unknown> = {}) {
      const name = query.match(/(?:query|mutation)\s+(\w+)/)?.[1] ?? 'themes';
      calls.push(name);
      if (/roles: \[MAIN\]/.test(query)) return { themes: { nodes: [{ id: 't1' }] } };
      if (/themeFilesUpsert/.test(query)) {
        for (const f of variables.files as Array<{ filename: string; body: { value: string } }>) files[f.filename] = f.body.value;
        return { themeFilesUpsert: { upsertedThemeFiles: (variables.files as unknown[]).map(() => ({})), userErrors: [] } };
      }
      if (/themeFilesDelete/.test(query)) {
        for (const f of variables.files as string[]) delete files[f];
        return { themeFilesDelete: { deletedThemeFiles: [], userErrors: [] } };
      }
      if (/DvflyThemeFiles/.test(query)) {
        const names = variables.filenames as string[];
        return { theme: { files: { nodes: names.filter((n) => n in files).map((n) => ({ filename: n, body: { content: files[n] } })) } } };
      }
      if (/DvflyProductStates/.test(query)) {
        return {
          nodes: (variables.ids as string[]).map((id) => {
            const p = products.find((x) => x.id === id);
            return p
              ? {
                  id: p.id,
                  handle: p.handle,
                  title: p.handle,
                  status: p.status ?? 'ACTIVE',
                  onlineStoreUrl: p.online === false ? null : `https://loja/products/${p.handle}`,
                  templateSuffix: p.templateSuffix ?? null,
                  abEntry: p.abEntry ? { value: p.abEntry } : null,
                }
              : null;
          }),
        };
      }
      if (/DvflyMetafieldsSet/.test(query)) {
        for (const m of variables.metafields as Array<{ ownerId: string; namespace: string; key: string; value: string; type: string }>) {
          assert.equal(`${m.namespace}.${m.key}:${m.type}`, 'dvfly.ab_entry:single_line_text_field');
          products.find((p) => p.id === m.ownerId)!.abEntry = m.value;
        }
        return { metafieldsSet: { metafields: [], userErrors: [] } };
      }
      if (/DvflyMetafieldsDelete/.test(query)) {
        for (const m of variables.metafields as Array<{ ownerId: string }>) {
          const p = products.find((x) => x.id === m.ownerId);
          if (p) p.abEntry = null;
        }
        return { metafieldsDelete: { deletedMetafields: [], userErrors: [] } };
      }
      throw new Error(`unexpected: ${query.slice(0, 60)}`);
    },
  } as unknown as ShopifyClient;
  return { client, files, products, calls };
}

const THEME_LAYOUT =
  '<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <link rel="canonical" href="{{ canonical_url }}">\n  {{ content_for_header }}\n</head>\n<body>{% sections "header-group" %}{{ content_for_layout }}</body>\n</html>\n';

describe('version A on the entry URL itself (no redirect)', () => {
  const plan = (template: string | null) => ({
    ...INPUT,
    variants: [
      { id: 'va', handle: 'piadebanho', weight: 50 },
      { id: 'vb', handle: 'piadebanho1', weight: 50 },
    ],
    entry: { variantId: 'va', template },
  });

  it("default template: a copy of product.json on a copy of the theme's layout with the script in its head", async () => {
    const { client, files } = fakeStore({
      'templates/product.json': '/* tema */ {"sections":{"main":{"type":"main-product"}},"order":["main"],}',
      'layout/theme.liquid': THEME_LAYOUT,
    });
    const r = await ensureSplitTemplate(client, plan(null));
    assert.deepEqual(r, { suffix: 'dvfly-ab-cmtest1', mode: 'stay', note: null });
    const tpl = JSON.parse(stripJsonComments(files['templates/product.dvfly-ab-cmtest1.json']));
    assert.equal(tpl.layout, 'theme.dvfly-ab-cmtest1');
    assert.deepEqual(tpl.order, ['main']);
    const layout = files['layout/theme.dvfly-ab-cmtest1.liquid'];
    assert.ok(layout.indexOf('<script>') > layout.indexOf('<meta charset') && layout.indexOf('<script>') < layout.indexOf('{{ content_for_header }}'));
    assert.match(layout, /"i":"va","h":"piadebanho","w":50,"s":1/);
    assert.doesNotMatch(layout, /<noscript>/, 'no-JS visitors stay on A: no way out needed');
    assert.ok(layout.includes('{% sections "header-group" %}'), "the rest of A's layout is untouched");
    assert.equal(files['layout/theme.liquid'], THEME_LAYOUT, "the theme's own layout is never edited");
    assert.ok(!('sections/dvfly-ab-cmtest1.liquid' in files), 'no redirect-only page');
  });

  it("a D&VFly page on its own layout: that layout is the one copied, and the template keeps its sections", async () => {
    const { client, files } = fakeStore({
      'templates/product.dvfly-pg1.json': '{"layout":"theme.dvfly-pg1","sections":{"dvfly":{"type":"dvfly-p-pg1"}},"order":["dvfly"]}',
      'layout/theme.dvfly-pg1.liquid': '<html><head><meta charset="utf-8">{{ content_for_header }}</head><body>{{ content_for_layout }}</body></html>',
    });
    const r = await ensureSplitTemplate(client, plan('dvfly-pg1'));
    assert.equal(r.mode, 'stay');
    assert.equal(JSON.parse(stripJsonComments(files['templates/product.dvfly-ab-cmtest1.json'])).sections.dvfly.type, 'dvfly-p-pg1');
    assert.match(files['layout/theme.dvfly-ab-cmtest1.liquid'], /layout\/theme\.dvfly-pg1\.liquid with the test's script/);
  });

  it('falls back to ?view= when A cannot carry the script, and says why', async () => {
    const vintage = fakeStore({ 'templates/product.antigo.liquid': '<h1>{{ product.title }}</h1>' });
    const r1 = await ensureSplitTemplate(vintage.client, plan('antigo'));
    assert.equal(r1.mode, 'view');
    assert.match(r1.note!, /tipo antigo/);
    assert.match(vintage.files['layout/theme.dvfly-ab-cmtest1.liquid'], /"h":"piadebanho","w":50,"q":"antigo"/);

    const noLayout = fakeStore({ 'templates/product.solto.json': '{"layout":false,"sections":{},"order":[]}' });
    const r2 = await ensureSplitTemplate(noLayout.client, plan('solto'));
    assert.equal(r2.mode, 'view');
    assert.match(r2.note!, /não usa layout/);

    // Default template on a layout without content_for_header: a copy of the default for ?view=.
    const odd = fakeStore({ 'templates/product.json': '{"sections":{"m":{"type":"main-product"}},"order":["m"]}', 'layout/theme.liquid': '<html>{{ content_for_layout }}</html>' });
    const r3 = await ensureSplitTemplate(odd.client, plan(null));
    assert.equal(r3.mode, 'view');
    assert.match(r3.note!, /content_for_header/);
    assert.ok(odd.files['templates/product.dvfly-ab-cmtest1-a.json']);
    assert.match(odd.files['layout/theme.dvfly-ab-cmtest1.liquid'], /"q":"dvfly-ab-cmtest1-a"/);
  });

  it("A's template gone (page deleted, theme switched): A shows the default product template, as Shopify would, and says so", async () => {
    const store = fakeStore({ 'templates/product.json': '{"sections":{"m":{"type":"main-product"}},"order":["m"]}', 'layout/theme.liquid': THEME_LAYOUT });
    const r = await ensureSplitTemplate(store.client, plan('dvfly-apagada'));
    assert.equal(r.mode, 'stay');
    assert.match(r.note!, /não existe mais no tema/);
    assert.deepEqual(JSON.parse(stripJsonComments(store.files['templates/product.dvfly-ab-cmtest1.json'])).order, ['m']);
    // And through ?view=, never the template that is gone: that would loop.
    const vintage = fakeStore({ 'templates/product.liquid': '<h1>x</h1>' });
    const r2 = await ensureSplitTemplate(vintage.client, plan('dvfly-apagada'));
    assert.equal(r2.mode, 'view');
    assert.doesNotMatch(vintage.files['layout/theme.dvfly-ab-cmtest1.liquid'], /"q":"dvfly-apagada"/);
    assert.match(vintage.files['layout/theme.dvfly-ab-cmtest1.liquid'], /"q":"dvfly-ab-cmtest1-a"/);
  });

  it("a layout that decides by the template's name keeps A on ?view= (on the entry the name would differ)", async () => {
    const store = fakeStore({
      'templates/product.landing.json': '{"sections":{"m":{"type":"main-product"}},"order":["m"]}',
      'layout/theme.liquid': THEME_LAYOUT.replace('<body>', "<body>{% unless template.suffix == 'landing' %}<nav></nav>{% endunless %}"),
    });
    const r = await ensureSplitTemplate(store.client, plan('landing'));
    assert.equal(r.mode, 'view');
    assert.match(r.note!, /nome do modelo/);
  });

  it('a rewrite goes template first (the previous layout still sends everyone somewhere sensible)', async () => {
    const store = fakeStore({ 'templates/product.json': '{"sections":{"m":{"type":"main-product"}},"order":["m"]}', 'layout/theme.liquid': THEME_LAYOUT });
    await ensureSplitTemplate(store.client, plan(null));
    const writes: string[] = [];
    const graphql = store.client.graphql.bind(store.client);
    (store.client as unknown as { graphql: typeof graphql }).graphql = (async (q: string, v: Record<string, unknown> = {}) => {
      if (/themeFilesUpsert/.test(q)) writes.push(...(v.files as Array<{ filename: string }>).map((f) => f.filename));
      return graphql(q, v);
    }) as typeof graphql;
    await ensureSplitTemplate(store.client, plan(null));
    assert.deepEqual(writes, ['templates/product.dvfly-ab-cmtest1.json', 'layout/theme.dvfly-ab-cmtest1.liquid']);
    assert.match(store.files['templates/product.dvfly-ab-cmtest1.json'], /^\/\* D&VFly: copia de templates\/product\.json/);
  });

  it("notices when A's original changed after the copy", async () => {
    const store = fakeStore({ 'templates/product.json': '{"sections":{"m":{"type":"main-product"}},"order":["m"]}', 'layout/theme.liquid': THEME_LAYOUT });
    await ensureSplitTemplate(store.client, plan(null));
    assert.equal(await entryCopyChanged(store.client, 'cmtest1', null), false);
    store.files['layout/theme.liquid'] = THEME_LAYOUT.replace('</head>', '<script>gtm()</script></head>');
    assert.equal(await entryCopyChanged(store.client, 'cmtest1', null), true);
    await ensureSplitTemplate(store.client, plan(null));
    assert.equal(await entryCopyChanged(store.client, 'cmtest1', null), false);
    store.files['templates/product.json'] = '{"sections":{"m":{"type":"main-product"},"b":{"type":"badges"}},"order":["m","b"]}';
    assert.equal(await entryCopyChanged(store.client, 'cmtest1', null), true);
  });

  it('switching back to the redirect page rewrites the template as a redirect-only one', async () => {
    const store = fakeStore({ 'templates/product.json': '{"sections":{"m":{"type":"main-product"}},"order":["m"]}', 'layout/theme.liquid': THEME_LAYOUT });
    await ensureSplitTemplate(store.client, plan(null));
    await ensureSplitTemplate(store.client, { ...INPUT });
    assert.equal(JSON.parse(stripJsonComments(store.files['templates/product.dvfly-ab-cmtest1.json'])).sections.dvfly.type, 'dvfly-ab-cmtest1');
  });
});

describe('canonical of the variants', () => {
  it('canonicalAware: the standard tag follows dvfly.ab_entry; idempotent; other links untouched', () => {
    const { text, found } = canonicalAware(THEME_LAYOUT + '<link rel="alternate" href="{{ canonical_url }}">');
    assert.equal(found, true);
    assert.match(text, /rel="canonical" href="\{%- if product\.metafields\.dvfly\.ab_entry\.value != blank -%\}/);
    assert.match(text, /<link rel="alternate" href="\{\{ canonical_url \}\}">/);
    assert.equal(canonicalAware(text).text, text);
    assert.equal(canonicalAware('<head>{{ content_for_header }}</head>').found, false);
    const filtered = canonicalAware('<link rel="canonical" href="{{ canonical_url | escape }}">');
    assert.equal(filtered.found, true);
    assert.match(filtered.text, /dvfly\.ab_entry/);
  });

  it("D&VFly's own layouts are born canonical-aware (minimal and chrome-less)", () => {
    assert.match(chromelessLayout(null), /dvfly\.ab_entry/);
    assert.match(chromelessLayout(THEME_LAYOUT), /dvfly\.ab_entry/);
  });

  it('points the variants at the entry; D&VFly layouts patched in place, theme layouts left alone; release undoes', async () => {
    const pageLayout = '<html><head><link rel="canonical" href="{{ canonical_url }}">{{ content_for_header }}</head></html>';
    const store = fakeStore(
      {
        'templates/product.dvfly-pg1.json': '{"layout":"theme.dvfly-pg1","sections":{},"order":[]}',
        'layout/theme.dvfly-pg1.liquid': pageLayout,
        'templates/product.json': '{"sections":{},"order":[]}',
        'layout/theme.liquid': THEME_LAYOUT,
      },
      [
        { id: 'p1', handle: 'piadebanho1', templateSuffix: 'dvfly-pg1' },
        { id: 'p2', handle: 'piadebanho2', templateSuffix: null },
      ],
    );
    const products = () => store.products.map((p) => ({ id: p.id, templateSuffix: p.templateSuffix ?? null, abEntry: p.abEntry ?? null }));
    const before = await inspectVariantCanonicals(store.client, 'piadebanho', products());
    assert.deepEqual([...before], [['p1', 'unset'], ['p2', 'theme']]);
    const states = await pointVariantCanonicals(store.client, 'piadebanho', products());
    assert.deepEqual([...states], [['p1', 'ok'], ['p2', 'theme']]);
    assert.match(store.files['layout/theme.dvfly-pg1.liquid'], /dvfly\.ab_entry/);
    assert.equal(store.files['layout/theme.liquid'], THEME_LAYOUT);
    assert.deepEqual(store.products.map((p) => p.abEntry), ['piadebanho', 'piadebanho']);
    assert.deepEqual([...(await inspectVariantCanonicals(store.client, 'piadebanho', products()))], [['p1', 'ok'], ['p2', 'theme']]);
    await releaseVariantCanonicals(store.client, ['p1', 'p2']);
    assert.deepEqual(store.products.map((p) => p.abEntry), [null, null]);
    assert.deepEqual([...(await inspectVariantCanonicals(store.client, 'piadebanho', products()))], [['p1', 'unset'], ['p2', 'theme']]);
  });

  it('refuses an entry handle that could break out of the Liquid', async () => {
    const store = fakeStore({}, [{ id: 'p1', handle: 'x' }]);
    await assert.rejects(pointVariantCanonicals(store.client, 'x"}}', [{ id: 'p1', templateSuffix: null }]), /inválido/);
  });
});

describe('reachability of a product page', () => {
  it('says why a visitor would not see it', async () => {
    const store = fakeStore({}, [
      { id: 'ok', handle: 'a' },
      { id: 'draft', handle: 'b', status: 'DRAFT' },
      { id: 'arch', handle: 'c', status: 'ARCHIVED' },
      { id: 'off', handle: 'd', online: false },
      { id: 'unl', handle: 'e', status: 'UNLISTED' },
    ]);
    const states = await productStates(store.client, ['ok', 'draft', 'arch', 'off', 'unl', 'gone', 'ok']);
    assert.equal(store.calls.filter((c) => c === 'DvflyProductStates').length, 1);
    assert.equal(unreachableReason(states.get('ok')!), null);
    assert.match(unreachableReason(states.get('draft')!)!, /Rascunho/);
    assert.match(unreachableReason(states.get('arch')!)!, /Arquivado/);
    // No storefront URL: off the Online Store, OR a store with a password — a doubt, never a block.
    assert.equal(unreachableReason(states.get('off')!), null);
    assert.match(publicationDoubt(states.get('off')!)!, /Loja virtual.*senha/);
    assert.equal(publicationDoubt(states.get('ok')!), null);
    assert.equal(publicationDoubt(states.get('draft')!), null, 'a draft is already a verdict');
    assert.equal(unreachableReason(states.get('unl')!), null);
    assert.match(unreachableReason(states.get('gone') ?? null)!, /apagado/);
  });
});
