import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ShopifyError } from '../src/client.ts';
import {
  chromelessLayout,
  composeProductTemplate,
  productSectionLiquid,
  productSectionType,
  productSuffix,
  stripJsonComments,
} from '../src/templates.ts';

const THEME_PRODUCT_JSON = `/*
 * IMPORTANT: The contents of this file are auto-generated.
 */
{
  "sections": {
    "main": { "type": "main-product", "blocks": { "title": { "type": "title" } }, "block_order": ["title"] },
    "related": { "type": "related-products", "settings": { "heading": "You may also like" } }
  },
  "order": ["main", "related"]
}`;

describe('stripJsonComments', () => {
  it('removes the theme editor comment block so the file parses', () => {
    const parsed = JSON.parse(stripJsonComments(THEME_PRODUCT_JSON));
    assert.deepEqual(parsed.order, ['main', 'related']);
  });

  it('tolerates the trailing commas Shopify allows in theme JSON', () => {
    const parsed = JSON.parse(stripJsonComments('{ "sections": { "main": { "type": "main-product", }, }, "order": ["main",], }'));
    assert.deepEqual(parsed.order, ['main']);
  });

  it('never touches a comma inside a string value', () => {
    const parsed = JSON.parse(
      stripJsonComments('{ "heading": "Related, ]", "quote": "say \\"a, }\\" here", "order": ["main",], }'),
    );
    assert.equal(parsed.heading, 'Related, ]');
    assert.equal(parsed.quote, 'say "a, }" here');
    assert.deepEqual(parsed.order, ['main']);
  });
});

describe('composeProductTemplate', () => {
  const input = { pageId: 'cmAbC123', title: 'Oferta', fragment: '<p>x</p>' };

  it('keeps every theme section and appends ours below by default', () => {
    const out = JSON.parse(composeProductTemplate(THEME_PRODUCT_JSON, input));
    assert.deepEqual(out.order, ['main', 'related', 'dvfly']);
    assert.equal(out.sections.dvfly.type, productSectionType('cmAbC123'));
    assert.equal(out.sections.main.type, 'main-product');
    assert.equal(out.sections.related.settings.heading, 'You may also like');
  });

  it('puts ours first when contentAbove is set', () => {
    const out = JSON.parse(composeProductTemplate(THEME_PRODUCT_JSON, { ...input, contentAbove: true }));
    assert.deepEqual(out.order, ['dvfly', 'main', 'related']);
  });

  it('drops order entries the theme file does not define, and refuses an empty template', () => {
    const broken = JSON.stringify({ sections: { main: { type: 'main-product' } }, order: ['main', 'ghost'] });
    assert.deepEqual(JSON.parse(composeProductTemplate(broken, input)).order, ['main', 'dvfly']);
    assert.throws(() => composeProductTemplate(null, input), ShopifyError);
    assert.throws(() => composeProductTemplate('{ not json', input), ShopifyError);
  });

  it('lowercases the page id in suffix and section type', () => {
    assert.equal(productSuffix('cmAbC'), 'dvfly-cmabc');
    assert.equal(productSectionType('cmAbC'), 'dvfly-p-cmabc');
  });

  it('does not duplicate our id when the theme file already carries it', () => {
    const theme = JSON.stringify({
      sections: { main: { type: 'main-product' }, dvfly: { type: 'something-else' } },
      order: ['dvfly', 'main'],
    });
    const out = JSON.parse(composeProductTemplate(theme, input));
    assert.deepEqual(out.order, ['main', 'dvfly']);
    assert.equal(out.sections.dvfly.type, productSectionType('cmAbC123'));
  });

  it("republishes on top of the merchant's edited copy, keeping their order and hidden sections", () => {
    const edited = JSON.stringify({
      sections: {
        main: { type: 'main-product' },
        related: { type: 'related-products', disabled: true },
        dvfly: { type: productSectionType('cmAbC123'), settings: {} },
        extra: { type: 'newsletter' },
      },
      order: ['main', 'dvfly', 'related', 'extra'],
    });
    const out = JSON.parse(composeProductTemplate(THEME_PRODUCT_JSON, input, edited));
    // Ours sits in the middle where the merchant put it; the theme default is not consulted.
    assert.deepEqual(out.order, ['main', 'dvfly', 'related', 'extra']);
    assert.equal(out.sections.related.disabled, true);
    assert.equal(out.sections.extra.type, 'newsletter');
  });

  it('moves ours between the ends when the position setting changes, unless the merchant placed it', () => {
    const atEnd = JSON.stringify({
      sections: { main: { type: 'main-product' }, related: { type: 'related-products' }, dvfly: { type: 'x' } },
      order: ['main', 'related', 'dvfly'],
    });
    assert.deepEqual(
      JSON.parse(composeProductTemplate(THEME_PRODUCT_JSON, { ...input, contentAbove: true }, atEnd)).order,
      ['dvfly', 'main', 'related'],
    );
    const removedByMerchant = JSON.stringify({
      sections: { main: { type: 'main-product' } },
      order: ['main'],
    });
    assert.deepEqual(
      JSON.parse(composeProductTemplate(THEME_PRODUCT_JSON, input, removedByMerchant)).order,
      ['main', 'dvfly'],
    );
  });

  it('binds our chrome-less layout when asked, and only removes OUR layout when not', () => {
    const off = JSON.parse(composeProductTemplate(THEME_PRODUCT_JSON, { ...input, chrome: false }));
    assert.equal(off.layout, 'theme.dvfly-product');
    // Republished with chrome back on: our layout goes, the theme default returns.
    const on = JSON.parse(composeProductTemplate(THEME_PRODUCT_JSON, { ...input, chrome: true }, JSON.stringify(off)));
    assert.equal(on.layout, undefined);
    // A layout the theme itself declared is kept.
    const themed = JSON.stringify({ layout: 'theme.alt', sections: { main: { type: 'main-product' } }, order: ['main'] });
    assert.equal(JSON.parse(composeProductTemplate(themed, input)).layout, 'theme.alt');
  });

  it('bare: our section alone on the minimal layout, whatever the theme or the merchant had', () => {
    const out = JSON.parse(composeProductTemplate(THEME_PRODUCT_JSON, { ...input, bare: true }));
    assert.equal(out.layout, 'theme.dvfly');
    assert.deepEqual(out.order, ['dvfly']);
    assert.deepEqual(Object.keys(out.sections), ['dvfly']);
    assert.equal(out.sections.dvfly.type, productSectionType('cmAbC123'));
    // Needs nothing from the theme: a theme without product.json still publishes.
    assert.doesNotThrow(() => composeProductTemplate(null, { ...input, bare: true }));
    // The merchant's edited copy is not consulted either — there is nothing of theirs to keep.
    const edited = JSON.stringify({ sections: { main: { type: 'main-product' }, dvfly: { type: 'x' } }, order: ['main', 'dvfly'] });
    assert.deepEqual(JSON.parse(composeProductTemplate(THEME_PRODUCT_JSON, { ...input, bare: true }, edited)).order, ['dvfly']);
    // Bare off again: the theme's own product.json is the base, since the bare copy has no theme sections.
    const back = JSON.parse(composeProductTemplate(THEME_PRODUCT_JSON, input, JSON.stringify(out)));
    assert.deepEqual(back.order, ['main', 'related', 'dvfly']);
    assert.equal(back.layout, undefined);
  });

  it('falls back to the theme default when the existing copy is unreadable or empty', () => {
    assert.deepEqual(
      JSON.parse(composeProductTemplate(THEME_PRODUCT_JSON, input, '{ broken')).order,
      ['main', 'related', 'dvfly'],
    );
    assert.deepEqual(
      JSON.parse(composeProductTemplate(THEME_PRODUCT_JSON, input, '{ "sections": {}, "order": [] }')).order,
      ['main', 'related', 'dvfly'],
    );
  });
});

describe('chromelessLayout', () => {
  it("strips the theme's header/footer section tags and keeps everything else", () => {
    const theme = `<!doctype html><html><head>{{ content_for_header }}<link href="{{ 'base.css' | asset_url }}"></head>
<body>{% sections 'header-group' %}
<main>{{ content_for_layout }}</main>
{% sections 'footer-group' %}{%- section 'announcement-bar' -%}</body></html>`;
    const out = chromelessLayout(theme);
    assert.ok(!/header-group|footer-group|announcement-bar/.test(out.replace(/\{%-? comment[\s\S]*?endcomment -?%\}/g, '')));
    assert.ok(out.includes("{{ 'base.css' | asset_url }}"), 'theme assets must survive');
    assert.ok(out.includes('{{ content_for_layout }}'));
    assert.ok(out.includes('{{ content_for_header }}'));
  });

  it('falls back to the minimal layout when the theme uses no known tags, or is missing', () => {
    assert.ok(chromelessLayout('<html>{{ content_for_layout }}</html>').includes('<body style="margin:0">'));
    assert.ok(chromelessLayout(null).includes('{{ content_for_header }}'));
  });

  it('the minimal layout warms the CDN connection before Shopify head, without CORS', () => {
    const layout = chromelessLayout(null);
    const preconnect = layout.indexOf('<link rel="preconnect" href="https://cdn.shopify.com">');
    assert.ok(preconnect > 0, layout);
    assert.ok(preconnect < layout.indexOf('{{ content_for_header }}'));
    assert.ok(!/preconnect[^>]*crossorigin/.test(layout), 'images are fetched without CORS');
  });
});

describe('productSectionLiquid', () => {
  it('wraps the fragment in raw and caps the schema name at 25 characters', () => {
    const liquid = productSectionLiquid({
      pageId: 'p1',
      title: 'Um título bem comprido para a seção',
      fragment: '<div>{{ not liquid }}</div>',
    });
    assert.match(liquid, /\{% raw %\}\n<div>\{\{ not liquid \}\}<\/div>\n\{% endraw %\}/);
    const schema = JSON.parse(/\{% schema %\}\n([\s\S]*?)\n\{% endschema %\}/.exec(liquid)![1]);
    assert.ok(schema.name.length <= 25, schema.name);
    assert.ok(schema.name.startsWith('D&VFly'));
    assert.deepEqual(schema.enabled_on, { templates: ['product'] });
    assert.equal(schema.limit, 1);
    assert.equal(schema.presets, undefined);
  });

  it('never cuts an emoji in half and drops the separator for an empty title', () => {
    const schemaOf = (title: string) => {
      const liquid = productSectionLiquid({ pageId: 'p1', title, fragment: '<p>x</p>' });
      return JSON.parse(/\{% schema %\}\n([\s\S]*?)\n\{% endschema %\}/.exec(liquid)![1]);
    };
    const emoji = schemaOf('Black Friday 20🎁 mega');
    assert.ok(emoji.name.isWellFormed(), emoji.name);
    assert.ok(Array.from(emoji.name).length <= 25);
    assert.equal(schemaOf('   ').name, 'D&VFly');
  });

  it('refuses a fragment that would close the raw block', () => {
    assert.throws(
      () => productSectionLiquid({ pageId: 'p1', title: 'x', fragment: 'a {% endraw %} b' }),
      ShopifyError,
    );
  });
});
