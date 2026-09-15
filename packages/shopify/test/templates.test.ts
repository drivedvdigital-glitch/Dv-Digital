import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ShopifyError } from '../src/client.ts';
import {
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

  it('refuses a fragment that would close the raw block', () => {
    assert.throws(
      () => productSectionLiquid({ pageId: 'p1', title: 'x', fragment: 'a {% endraw %} b' }),
      ShopifyError,
    );
  });
});
