import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import vm from 'node:vm';

import { ShopifyError, type ShopifyClient } from '../src/client.ts';
import { ordersUpdatedSince } from '../src/orders.ts';
import {
  ensureEntryCopy,
  ensureSplitTemplate,
  removeSplitTemplate,
  splitLayoutLiquid,
  splitScript,
  splitSuffix,
  type SplitInput,
} from '../src/split.ts';

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
  opts: { random?: number; stored?: string | null; search?: string; path?: string; framed?: boolean } = {},
) {
  const store = new Map<string, string>();
  if (opts.stored) store.set(`dvf_ab_${input.testId}`, opts.stored);
  const beacons: string[] = [];
  let replaced: string | null = null;
  const win: Record<string, unknown> = {};
  const location = {
    search: opts.search ?? '',
    hash: '#oferta',
    pathname: opts.path ?? '/products/piadebanho',
    replace: (url: string) => (replaced = url),
  };
  Object.assign(win, {
    location,
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
    navigator: { sendBeacon: (_url: string, body: string) => (beacons.push(body), true) },
    Math: { ...Math, random: () => opts.random ?? 0 },
    JSON,
  });
  win.window = win;
  win.self = win;
  win.top = opts.framed ? {} : win;
  const code = splitScript(input).replace(/^<script>|<\/script>$/g, '');
  vm.runInNewContext(code, win);
  return { replaced, beacons: beacons.map((b) => JSON.parse(b)), stored: store.get(`dvf_ab_${input.testId}`) };
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
    await assert.rejects(ordersUpdatedSince(client, new Date()), /read_orders.*dados protegidos/s);
  });
});
