/**
 * Preparing another theme before publishing it (theme-prep.ts): every
 * template a product or page points at must render the same in the new
 * theme, the source theme is never touched, and nothing looks up MAIN when a
 * theme is named.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ensureSplitTemplate } from '../src/split.ts';
import {
  appEmbeds,
  checkPlan,
  checkSplit,
  disableAppEmbeds,
  missingTemplates,
  planTemplate,
  prepareSplit,
  templateUses,
  writePlan,
} from '../src/theme-prep.ts';
import {
  ensureSoloTemplate,
  LAYOUT,
  listThemes,
  SECTION,
  TEMPLATE,
} from '../src/templates.ts';
import { fakeThemesStore, type FakeTheme } from './fake-themes.ts';

const json = (value: unknown) => JSON.stringify(value, null, 2);

const OLD_LAYOUT = `<!doctype html><html><head><link rel="canonical" href="{{ canonical_url }}">{{ content_for_header }}</head>
<body>{% sections 'header-group' %}<main>{{ content_for_layout }}</main>{% sections 'footer-group' %}</body></html>`;
const NEW_LAYOUT = `<!doctype html><html><head><meta name="tema" content="shrine-original"><link rel="canonical" href="{{ canonical_url }}">{{ content_for_header }}</head>
<body>{% sections 'header-group' %}<div id="novo">{{ content_for_layout }}</div>{% sections 'footer-group' %}</body></html>`;

/** The published copy of Shrine, with every kind of D&VFly page in it. */
function sourceTheme(): FakeTheme {
  return {
    id: 'gid://shopify/OnlineStoreTheme/1',
    name: 'Shrine cópia',
    role: 'MAIN',
    files: {
      'layout/theme.liquid': OLD_LAYOUT,
      'templates/product.json': json({ sections: { main: { type: 'main-product' } }, order: ['main'] }),
      'sections/main-product.liquid': 'main',
      'sections/related.liquid': 'related',
      'sections/old-only.liquid': 'só no tema antigo',
      // A bare page with a hero preload, written before canonicals followed A|B entries.
      'layout/theme.dvfly-abc.liquid': `<head><link rel="preload" as="image" href="hero.jpg"><link rel="canonical" href="{{ canonical_url }}">{{ content_for_header }}</head><body>{{ content_for_layout }}</body>`,
      'sections/dvfly-p-abc.liquid': '{% raw %}<div>LP abc</div>{% endraw %}',
      'templates/product.dvfly-abc.json': json({ layout: 'theme.dvfly-abc', sections: { dvfly: { type: 'dvfly-p-abc', settings: {} } }, order: ['dvfly'] }),
      // Theme sections around, no header/footer, our section moved to the middle in the theme editor.
      'layout/theme.dvfly-product.liquid': 'derivado do tema antigo',
      'sections/dvfly-p-def.liquid': 'LP def',
      'templates/product.dvfly-def.json': json({
        layout: 'theme.dvfly-product',
        sections: { main: { type: 'main-product', settings: { cor: 'azul' } }, dvfly: { type: 'dvfly-p-def', settings: {} }, related: { type: 'related' } },
        order: ['main', 'dvfly', 'related'],
      }),
      // Theme chrome, our content above, using a section only the old theme has.
      'sections/dvfly-p-ghi.liquid': 'LP ghi',
      'templates/product.dvfly-ghi.json': json({
        sections: { dvfly: { type: 'dvfly-p-ghi', settings: {} }, main: { type: 'main-product' }, extra: { type: 'old-only' } },
        order: ['dvfly', 'main', 'extra'],
      }),
      // A regular page without the theme, and one that runs Liquid.
      'layout/theme.dvfly.liquid': LAYOUT,
      'sections/dvfly-page.liquid': SECTION,
      'templates/page.dvfly-solo.json': TEMPLATE,
      'sections/dvfly-pg-jkl.liquid': "{% include 'gtm-roteador' %}{% raw %}<p>rodapé {% render 'nao-e-liquid' %}</p>{% endraw %}",
      'snippets/gtm-roteador.liquid': "{% assign nome_loja = 'Ofertas' %}",
      'templates/page.dvfly-pg-jkl.json': json({ layout: 'theme.dvfly', sections: { dvfly: { type: 'dvfly-pg-jkl' } }, order: ['dvfly'] }),
    },
  };
}

/** The original Shrine, uploaded and not published: none of D&VFly's files. */
function targetTheme(): FakeTheme {
  return {
    id: 'gid://shopify/OnlineStoreTheme/2',
    name: 'Shrine PRO original',
    role: 'UNPUBLISHED',
    files: {
      'layout/theme.liquid': NEW_LAYOUT,
      'templates/product.json': json({ sections: { main: { type: 'main-product' }, reviews: { type: 'reviews' } }, order: ['main', 'reviews'] }),
      'sections/main-product.liquid': 'main novo',
      'sections/related.liquid': 'related novo',
      'sections/reviews.liquid': 'reviews',
      'config/settings_data.json':
        '/* comentário do editor */\n' +
        json({
          current: {
            colors: 'escuras',
            blocks: {
              '1': { type: 'shopify://apps/easysell-cod-form/blocks/app-embed/7bfd', disabled: false },
              '2': { type: 'shopify://apps/pagefly-ai-page-builder/blocks/app-embed/83e1', disabled: false },
              '3': { type: 'shopify://apps/pagefly-ai-page-builder/blocks/smart-cart-drawer/83e1', disabled: true },
            },
          },
        }),
    },
  };
}

const SRC = 'gid://shopify/OnlineStoreTheme/1';
const DST = 'gid://shopify/OnlineStoreTheme/2';

async function carry(store: ReturnType<typeof fakeThemesStore>, resource: 'product' | 'page', suffix: string, completing = false, target = DST) {
  const plan = await planTemplate(store.client, SRC, target, resource, suffix);
  return { plan, outcome: await writePlan(store.client, target, plan, { completing }) };
}

describe('preparing an unpublished theme', () => {
  it('lists the themes, the published one first', async () => {
    const store = fakeThemesStore({ themes: [targetTheme(), sourceTheme()] });
    const themes = await listThemes(store.client);
    assert.deepEqual(themes.map((t) => [t.name, t.role]), [['Shrine cópia', 'MAIN'], ['Shrine PRO original', 'UNPUBLISHED']]);
  });

  it('writes the minimal layout before the template that names it (a fresh theme refused it in one call)', async () => {
    const store = fakeThemesStore({ themes: [sourceTheme(), targetTheme()] });
    await ensureSoloTemplate(store.client, { themeId: DST });
    const target = store.theme(DST).files;
    assert.equal(target['layout/theme.dvfly.liquid'], LAYOUT);
    assert.equal(target['templates/page.dvfly-solo.json'], TEMPLATE);
    assert.ok(!store.calls.includes('mainTheme'), 'a named theme is never looked up as MAIN');
  });

  it("copies a bare page byte for byte, and its own layout through the canonical that follows A|B entries", async () => {
    const store = fakeThemesStore({ themes: [sourceTheme(), targetTheme()] });
    const { outcome } = await carry(store, 'product', 'dvfly-abc');
    assert.equal(outcome.status, 'pronto', outcome.problem ?? '');
    const target = store.theme(DST).files;
    const source = store.theme(SRC).files;
    assert.equal(target['sections/dvfly-p-abc.liquid'], source['sections/dvfly-p-abc.liquid']);
    assert.equal(target['templates/product.dvfly-abc.json'], source['templates/product.dvfly-abc.json']);
    assert.match(target['layout/theme.dvfly-abc.liquid'], /preload/);
    assert.match(target['layout/theme.dvfly-abc.liquid'], /dvfly\.ab_entry/, 'an old layout comes out canonical-aware');
  });

  it("rebuilds the no-header layout from the NEW theme's layout and keeps the merchant's arrangement", async () => {
    const store = fakeThemesStore({ themes: [sourceTheme(), targetTheme()] });
    const { outcome } = await carry(store, 'product', 'dvfly-def');
    assert.equal(outcome.status, 'pronto', outcome.problem ?? '');
    const target = store.theme(DST).files;
    const layout = target['layout/theme.dvfly-product.liquid'];
    assert.match(layout, /shrine-original/, 'derived from the target theme, not copied from the old one');
    assert.doesNotMatch(layout, /\{% sections 'header-group' %\}/);
    const template = JSON.parse(target['templates/product.dvfly-def.json']);
    assert.equal(template.layout, 'theme.dvfly-product');
    assert.deepEqual(template.order, ['main', 'dvfly', 'related'], 'our section stays where the merchant put it');
    assert.deepEqual(template.sections.main.settings, { cor: 'azul' });
  });

  it('falls back to the new theme\'s product page, saying so, when a section the page used does not exist there', async () => {
    const store = fakeThemesStore({ themes: [sourceTheme(), targetTheme()] });
    const { outcome } = await carry(store, 'product', 'dvfly-ghi');
    assert.equal(outcome.status, 'pronto', outcome.problem ?? '');
    assert.match(outcome.notes.join(' '), /old-only/);
    const template = JSON.parse(store.theme(DST).files['templates/product.dvfly-ghi.json']);
    assert.deepEqual(template.order, ['dvfly', 'main', 'reviews'], 'the new theme\'s sections, ours above as before');
    assert.equal(template.layout, undefined, 'theme header and footer, as before');
  });

  it('carries regular pages: without the theme, and with Liquid', async () => {
    const store = fakeThemesStore({ themes: [sourceTheme(), targetTheme()] });
    for (const suffix of ['dvfly-solo', 'dvfly-pg-jkl']) {
      const { outcome } = await carry(store, 'page', suffix);
      assert.equal(outcome.status, 'pronto', `${suffix}: ${outcome.problem}`);
    }
    const target = store.theme(DST).files;
    assert.equal(target['sections/dvfly-pg-jkl.liquid'], store.theme(SRC).files['sections/dvfly-pg-jkl.liquid']);
    assert.equal(target['layout/theme.dvfly.liquid'], LAYOUT);
    // The snippet the page's Liquid includes came along (the new theme lacked it);
    // a render inside the page's raw HTML is text, not a dependency.
    assert.equal(target['snippets/gtm-roteador.liquid'], store.theme(SRC).files['snippets/gtm-roteador.liquid']);
    assert.ok(!('snippets/nao-e-liquid.liquid' in target));
  });

  it("a snippet the page's Liquid needs and neither theme has: refused, never 'pronto'", async () => {
    const source = sourceTheme();
    delete source.files['snippets/gtm-roteador.liquid'];
    const store = fakeThemesStore({ themes: [source, targetTheme()] });
    const { outcome } = await carry(store, 'page', 'dvfly-pg-jkl');
    assert.equal(outcome.status, 'falhou');
    assert.match(outcome.problem!, /snippets\/gtm-roteador\.liquid/);
  });

  it("re-preparing keeps the arrangement the merchant made in the new theme's editor", async () => {
    const store = fakeThemesStore({ themes: [sourceTheme(), targetTheme()] });
    await carry(store, 'product', 'dvfly-ghi');
    const name = 'templates/product.dvfly-ghi.json';
    const arranged = JSON.parse(store.theme(DST).files[name]);
    arranged.order = ['main', 'dvfly', 'reviews'];
    arranged.sections.reviews.disabled = true;
    store.touch(DST, name, JSON.stringify(arranged));
    store.touch(SRC, 'templates/product.dvfly-ghi.json'); // republished in the old theme meanwhile
    await carry(store, 'product', 'dvfly-ghi');
    assert.deepEqual(JSON.parse(store.theme(DST).files[name]).order, ['main', 'dvfly', 'reviews']);
    assert.equal(JSON.parse(store.theme(DST).files[name]).sections.reviews.disabled, true);
    const check = await checkPlan(store.client, DST, await planTemplate(store.client, SRC, DST, 'product', 'dvfly-ghi'));
    assert.equal(check.status, 'pronto', check.detail ?? '');
  });

  it('when Shopify refuses the arrangement carried over, falls back to the new theme\'s product page', async () => {
    const store = fakeThemesStore({ themes: [sourceTheme(), targetTheme()] });
    // The new theme's main-product does not define a block the old arrangement uses.
    const graphql = store.client.graphql.bind(store.client);
    (store.client as unknown as { graphql: typeof graphql }).graphql = (async (q: string, v: Record<string, unknown> = {}) => {
      const files = (v.files ?? []) as Array<{ filename: string; body: { value: string } }>;
      if (/themeFilesUpsert/.test(q) && files.some((f) => f.filename === 'templates/product.dvfly-def.json' && f.body.value.includes('azul'))) {
        return { themeFilesUpsert: { upsertedThemeFiles: null, userErrors: [{ field: ['files'], message: 'Invalid block type' }] } };
      }
      return graphql(q, v);
    }) as typeof graphql;
    const { outcome } = await carry(store, 'product', 'dvfly-def');
    assert.equal(outcome.status, 'pronto', outcome.problem ?? '');
    assert.match(outcome.notes.join(' '), /recusou o arranjo/);
    const template = JSON.parse(store.theme(DST).files['templates/product.dvfly-def.json']);
    assert.deepEqual(template.order, ['main', 'reviews', 'dvfly']);
  });

  it('says why when the page is already broken in the published theme, and writes nothing', async () => {
    const store = fakeThemesStore({ themes: [sourceTheme(), targetTheme()] });
    const before = { ...store.theme(DST).files };
    const { outcome } = await carry(store, 'product', 'dvfly-zzz');
    assert.equal(outcome.status, 'falhou');
    assert.match(outcome.problem!, /não existe em nenhum dos dois temas/);
    assert.deepEqual(store.theme(DST).files, before);
  });

  it('never touches the source theme, and a second run changes nothing', async () => {
    const store = fakeThemesStore({ themes: [sourceTheme(), targetTheme()] });
    const source = JSON.stringify(store.theme(SRC).files);
    for (const [r, s] of [['product', 'dvfly-abc'], ['product', 'dvfly-def'], ['product', 'dvfly-ghi'], ['page', 'dvfly-solo'], ['page', 'dvfly-pg-jkl']] as const) await carry(store, r, s);
    const once = JSON.stringify(store.theme(DST).files);
    for (const [r, s] of [['product', 'dvfly-abc'], ['product', 'dvfly-def'], ['product', 'dvfly-ghi'], ['page', 'dvfly-solo'], ['page', 'dvfly-pg-jkl']] as const) await carry(store, r, s);
    assert.equal(JSON.stringify(store.theme(DST).files), once);
    assert.equal(JSON.stringify(store.theme(SRC).files), source);
    assert.ok(!store.calls.includes('mainTheme'));
  });

  it('checks by reading back: ready, missing, and stale after the page is republished in the old theme', async () => {
    const store = fakeThemesStore({ themes: [sourceTheme(), targetTheme()] });
    const before = await checkPlan(store.client, DST, await planTemplate(store.client, SRC, DST, 'product', 'dvfly-abc'));
    assert.equal(before.status, 'falta');
    await carry(store, 'product', 'dvfly-abc');
    assert.equal((await checkPlan(store.client, DST, await planTemplate(store.client, SRC, DST, 'product', 'dvfly-abc'))).status, 'pronto');
    store.theme(SRC).files['sections/dvfly-p-abc.liquid'] = '{% raw %}<div>LP abc, versão nova</div>{% endraw %}';
    const after = await checkPlan(store.client, DST, await planTemplate(store.client, SRC, DST, 'product', 'dvfly-abc'));
    assert.equal(after.status, 'desatualizado');
    assert.match(after.detail!, /sections\/dvfly-p-abc\.liquid/);
  });

  it('completing the published theme: fills what is missing, and a file published there after the switch wins', async () => {
    const source = sourceTheme();
    source.role = 'UNPUBLISHED';
    const target = targetTheme();
    target.role = 'MAIN';
    const store = fakeThemesStore({ themes: [source, target] });
    store.touch(DST, 'sections/dvfly-p-abc.liquid', 'publicada depois da troca');
    const { outcome } = await carry(store, 'product', 'dvfly-abc', true);
    assert.equal(outcome.status, 'pronto');
    assert.equal(store.theme(DST).files['sections/dvfly-p-abc.liquid'], 'publicada depois da troca');
    assert.ok('templates/product.dvfly-abc.json' in store.theme(DST).files);
    assert.equal((await checkPlan(store.client, DST, await planTemplate(store.client, SRC, DST, 'product', 'dvfly-abc'), { completing: true })).status, 'pronto');
  });

  it('completing the published theme: a page published only there is fine, not a failure', async () => {
    const source = sourceTheme();
    source.role = 'UNPUBLISHED';
    const target = targetTheme();
    target.role = 'MAIN';
    target.files['sections/dvfly-p-new.liquid'] = 'nova';
    target.files['templates/product.dvfly-new.json'] = json({ layout: 'theme.dvfly', sections: { dvfly: { type: 'dvfly-p-new' } }, order: ['dvfly'] });
    const store = fakeThemesStore({ themes: [source, target] });
    const { outcome } = await carry(store, 'product', 'dvfly-new', true);
    assert.equal(outcome.status, 'pronto', outcome.problem ?? '');
    const plan = await planTemplate(store.client, SRC, DST, 'product', 'dvfly-new');
    assert.equal((await checkPlan(store.client, DST, plan, { completing: true })).status, 'pronto');
  });

  it('completing the published theme: a page republished in the old one between preparing and publishing comes along', async () => {
    const store = fakeThemesStore({ themes: [sourceTheme(), targetTheme()] });
    await carry(store, 'product', 'dvfly-abc'); // prepared
    store.touch(SRC, 'sections/dvfly-p-abc.liquid', '{% raw %}<div>LP abc, publicada no meio tempo</div>{% endraw %}'); // gap publish
    store.theme(SRC).role = 'UNPUBLISHED'; // the merchant publishes the new theme
    store.theme(DST).role = 'MAIN';
    const plan = await planTemplate(store.client, SRC, DST, 'product', 'dvfly-abc');
    const check = await checkPlan(store.client, DST, plan, { completing: true });
    assert.equal(check.status, 'desatualizado');
    assert.match(check.detail!, /sections\/dvfly-p-abc\.liquid/);
    await writePlan(store.client, DST, plan, { completing: true });
    assert.match(store.theme(DST).files['sections/dvfly-p-abc.liquid'], /publicada no meio tempo/);
    assert.equal((await checkPlan(store.client, DST, await planTemplate(store.client, SRC, DST, 'product', 'dvfly-abc'), { completing: true })).status, 'pronto');
  });

  it('writes a live A|B test into the named theme, the version A copy included', async () => {
    const store = fakeThemesStore({ themes: [sourceTheme(), targetTheme()] });
    const plan = {
      testId: 'T1',
      name: 'Teste',
      hitUrl: 'https://app.exemplo/ab/hit',
      variants: [
        { id: 'va', handle: 'entrada', weight: 50 },
        { id: 'vb', handle: 'versao-b', weight: 50 },
      ],
      // Version A on the default product template: it is reached through a copy.
      entry: { variantId: 'va', template: null },
    };
    const outcome = await prepareSplit(store.client, DST, plan);
    assert.equal(outcome.status, 'pronto', outcome.problem ?? '');
    assert.ok(!store.calls.includes('mainTheme'), 'the version A copy must not land in the published theme');
    assert.equal(Object.keys(store.theme(SRC).files).filter((f) => f.includes('dvfly-ab-')).length, 0);
    assert.equal((await checkSplit(store.client, DST, 'T1')).status, 'pronto');
    assert.equal((await checkSplit(store.client, SRC, 'T1')).status, 'falta');
    // The same call without a theme still goes to MAIN, as every publish does.
    await ensureSplitTemplate(store.client, { ...plan, entry: undefined });
    assert.ok(store.calls.includes('mainTheme'));
  });

  it("refuses a live test whose version A uses a template the new theme lacks (it would show the default page)", async () => {
    const store = fakeThemesStore({ themes: [sourceTheme(), targetTheme()] });
    const plan = (template: string) => ({
      testId: 'T2',
      name: 'Teste',
      hitUrl: 'https://app.exemplo/ab/hit',
      variants: [
        { id: 'va', handle: 'entrada', weight: 50 },
        { id: 'vb', handle: 'versao-b', weight: 50 },
      ],
      entry: { variantId: 'va', template },
    });
    const foreign = await prepareSplit(store.client, DST, plan('pf-123'));
    assert.equal(foreign.status, 'falhou');
    assert.match(foreign.problem!, /pf-123.*não é do D&VFly/);
    const ours = await prepareSplit(store.client, DST, plan('dvfly-abc'));
    assert.equal(ours.status, 'falhou', 'its page has not been carried yet');
    await carry(store, 'product', 'dvfly-abc');
    const after = await prepareSplit(store.client, DST, plan('dvfly-abc'));
    assert.equal(after.status, 'pronto', after.problem ?? '');
    assert.equal(after.mode, 'stay');
    assert.equal((await checkSplit(store.client, DST, 'T2', 'dvfly-abc')).status, 'pronto');
  });

  it('a product still on a test that is not live: its layout and the version A copy it redirects to both come', async () => {
    // A layout that branches on the template name: version A cannot open on the entry URL, so it goes through ?view=.
    const source = sourceTheme();
    source.files['layout/theme.liquid'] = OLD_LAYOUT.replace('<main>', "{% if template.suffix == 'x' %}<i></i>{% endif %}<main>");
    const store = fakeThemesStore({ themes: [source, targetTheme()] });
    await ensureSplitTemplate(store.client, {
      testId: 'T3',
      name: 'Velho',
      hitUrl: 'https://app.exemplo/ab/hit',
      variants: [
        { id: 'va', handle: 'entrada', weight: 50 },
        { id: 'vb', handle: 'versao-b', weight: 50 },
      ],
      entry: { variantId: 'va', template: null },
    });
    assert.ok('templates/product.dvfly-ab-t3-a.json' in store.theme(SRC).files);
    const { outcome } = await carry(store, 'product', 'dvfly-ab-t3');
    assert.equal(outcome.status, 'pronto', outcome.problem ?? '');
    assert.ok('templates/product.dvfly-ab-t3-a.json' in store.theme(DST).files);
    assert.equal((await checkSplit(store.client, DST, 'T3')).status, 'pronto');
  });

  it('finds every alternate template in use, across pages of products, and which ones the new theme lacks', async () => {
    const products = Array.from({ length: 6 }, (_, i) => ({ title: `P${i}`, templateSuffix: i % 2 ? 'dvfly-abc' : null }));
    products.push({ title: 'Oferta PageFly', templateSuffix: 'pf-123' });
    const store = fakeThemesStore({
      themes: [sourceTheme(), targetTheme()],
      products,
      pages: [{ title: 'Sobre', templateSuffix: 'dvfly-solo' }],
      pageSize: 2,
    });
    const uses = await templateUses(store.client);
    const key = (u: { resource: string; suffix: string }) => `${u.resource}.${u.suffix}`;
    assert.deepEqual(uses.map(key).sort(), ['page.dvfly-solo', 'product.dvfly-abc', 'product.pf-123']);
    assert.deepEqual(uses.find((u) => u.suffix === 'dvfly-abc')!.titles, ['P1', 'P3', 'P5']);
    const lacking = await missingTemplates(store.client, DST, uses.filter((u) => !u.suffix.startsWith('dvfly-')));
    assert.deepEqual(lacking.map(key), ['product.pf-123']);
  });

  it("switches one app's embeds off in one theme, keeping every other setting", async () => {
    const store = fakeThemesStore({ themes: [sourceTheme(), targetTheme()] });
    assert.deepEqual(
      (await appEmbeds(store.client, DST)).map((e) => [e.app, e.enabled]),
      [['easysell-cod-form', true], ['pagefly-ai-page-builder', true], ['pagefly-ai-page-builder', false]],
    );
    assert.equal(await disableAppEmbeds(store.client, DST, 'pagefly-ai-page-builder'), 1);
    const embeds = await appEmbeds(store.client, DST);
    assert.deepEqual(embeds.map((e) => [e.app, e.enabled]), [['easysell-cod-form', true], ['pagefly-ai-page-builder', false], ['pagefly-ai-page-builder', false]]);
    const settings = JSON.parse(store.theme(DST).files['config/settings_data.json']);
    assert.equal(settings.current.colors, 'escuras');
    assert.equal(await disableAppEmbeds(store.client, DST, 'pagefly-ai-page-builder'), 0, 'already off: nothing written');
  });
});
