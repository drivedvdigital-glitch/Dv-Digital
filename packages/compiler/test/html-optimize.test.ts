/**
 * Tests for the HTML optimization pass.
 *
 * These guard the resolution to the tension recorded in docs/USO_REAL.md: the
 * author writes HTML by hand, and the compiler still has to earn its keep. If
 * these go red, hand-written pages stop being optimized and the project's
 * performance claim stops being true for the way the tool is actually used.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { compile } from '../src/compile.ts';
import { StyleSheet } from '../src/css.ts';
import { optimizeHtml, scopeCss } from '../src/html-optimize.ts';
import type { Doc } from '../src/schema.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const advertorial = () =>
  readFileSync(join(ROOT, 'fixtures', 'advertorial.html'), 'utf8');

const docWith = (html: string): Doc => ({
  version: 1,
  root: [{ id: 'block', type: 'html', props: { html } }],
});

const run = (html: string) => {
  const sheet = new StyleSheet();
  return optimizeHtml(html, { sheet, scope: 'dvf-page' });
};

// --- inline styles are the author's, and they stay ------------------------

test('inline styles are kept verbatim, never moved into classes', () => {
  const result = run('<p style="color:red;font-size:18px">oi</p>');
  assert.match(result.html, /style="color:red;font-size:18px"/);
  assert.doesNotMatch(result.html, /class="dvf-/);
  assert.equal(result.stats.inlineStylesKept, 1);
});

test("the author's own stylesheet cannot outrank his own inline style", () => {
  // The bug of 16/09: hoisted to a class, `margin:16px 0` lost to the page's
  // own `#lp .price` rule and the layout came out different from the paste.
  const result = run('<style>#lp .price{margin-bottom:10px}</style><div id="lp"><div class="price" style="margin:16px 0">x</div></div>');
  assert.match(result.html, /class="price" style="margin:16px 0"/);
  assert.match(result.html, /\.dvf-page #lp \.price\{margin-bottom:10px\}/);
});

test('an existing class is left exactly as written', () => {
  const result = run('<p class="kicker" style="color:#8a6d3b">x</p>');
  assert.match(result.html, /class="kicker" style="color:#8a6d3b"/);
});

test('an empty style attribute is removed without counting', () => {
  const result = run('<p style="  ">x</p>');
  assert.doesNotMatch(result.html, /style=/);
  assert.equal(result.stats.inlineStylesKept, 0);
});

// --- scoping author CSS ----------------------------------------------------

test('author selectors are confined to our subtree', () => {
  assert.equal(scopeCss('.wrap{margin:0}', 'dvf-page'), '.dvf-page .wrap{margin:0}');
  assert.equal(
    scopeCss('h1,h2{font-weight:700}', 'dvf-page'),
    '.dvf-page h1,.dvf-page h2{font-weight:700}',
  );
});

test('body and :root are rewritten to the page scope, not left global', () => {
  // Without this, an author's `body{...}` would restyle the merchant's whole
  // storefront from inside one block.
  assert.equal(scopeCss('body{color:#111}', 'dvf-page'), '.dvf-page{color:#111}');
  assert.equal(scopeCss(':root{--x:1px}', 'dvf-page'), '.dvf-page{--x:1px}');
});

test('media queries are scoped inside, not outside', () => {
  const out = scopeCss('@media (max-width:600px){.wrap{padding:0 16px}}', 'dvf-page');
  assert.equal(out, '@media (max-width:600px){.dvf-page .wrap{padding:0 16px}}');
});

test('keyframes are left alone, because their contents are not selectors', () => {
  const out = scopeCss('@keyframes fade{from{opacity:0}to{opacity:1}}', 'dvf-page');
  assert.equal(out, '@keyframes fade{from{opacity:0}to{opacity:1}}');
  assert.doesNotMatch(out, /\.dvf-page from/);
});

test('a style block in the markup gets scoped in place', () => {
  const result = run('<style>.a{color:red}</style><div class="a">x</div>');
  assert.match(result.html, /\.dvf-page \.a\{color:red\}/);
  assert.equal(result.stats.styleBlocksScoped, 1);
});

// --- images ----------------------------------------------------------------

test('images below the first one become lazy', () => {
  const result = run('<img src="a.jpg" alt=""><img src="b.jpg" alt="">');
  const tags = result.html.match(/<img[^>]*>/g)!;
  assert.doesNotMatch(tags[0], /loading=/, 'the first image is treated as the hero');
  assert.match(tags[1], /loading="lazy"/);
});

test('an explicit eager marker keeps an image out of lazy loading', () => {
  const result = run('<img src="a.jpg" alt=""><img src="b.jpg" alt="" data-dvf-eager>');
  const tags = result.html.match(/<img[^>]*>/g)!;
  assert.doesNotMatch(tags[1], /loading="lazy"/);
});

test('an author-set loading attribute is never overridden', () => {
  const result = run('<img src="a.jpg" alt=""><img src="b.jpg" alt="" loading="eager">');
  assert.match(result.html, /loading="eager"/);
  assert.doesNotMatch(result.html, /loading="lazy"/);
});

test('missing dimensions and missing alt are reported, not silently fixed', () => {
  const result = run('<img src="/hero.jpg">');
  const codes = result.findings.map((f) => f.code);
  assert.ok(codes.includes('html/image-missing-dimensions'));
  assert.ok(codes.includes('html/image-missing-alt'));
});

test('an explicitly empty alt is accepted as a decorative image', () => {
  const result = run('<img src="/i.svg" alt="" width="40" height="40">');
  assert.deepEqual(result.findings, []);
});

// --- reporting without rewriting ------------------------------------------

test('a div navigating by onclick is flagged as the wrong element', () => {
  const result = run(`<div onclick="window.location='/x'">Comprar</div>`);
  const finding = result.findings.find((f) => f.code === 'html/click-handler-instead-of-link');
  assert.ok(finding, 'expected the click-handler finding');
  // Reported, not rewritten: turning a div into a link is the author's call.
  assert.match(result.html, /onclick=/);
});

test('scripts are counted and reported but published as written', () => {
  const result = run('<script>console.log(1)</script><p>x</p>');
  assert.equal(result.stats.scriptsFound, 1);
  assert.ok(result.findings.some((f) => f.code === 'html/contains-script'));
  assert.match(result.html, /console\.log\(1\)/);
});

test('the H1 check is page-level, so one block is not scolded for the page', () => {
  // Two HTML blocks, one H1 between them: correct, and must not warn twice.
  const doc: Doc = {
    version: 1,
    root: [
      { id: 'a', type: 'html', props: { html: '<h1>Título</h1>' } },
      { id: 'b', type: 'html', props: { html: '<p><a href="/x">continuar</a></p>' } },
    ],
  };
  assert.deepEqual(compile(doc).findings, []);
});

test('a link in author HTML satisfies the page-level call-to-action check', () => {
  const withLink = compile(docWith('<h1>t</h1><a href="/comprar">Comprar</a>'));
  assert.ok(!withLink.findings.some((f) => f.code === 'page/no-cta'));

  const without = compile(docWith('<h1>t</h1><p>só texto</p>'));
  assert.ok(without.findings.some((f) => f.code === 'page/no-cta'));
});

test('headings inside author HTML count toward the page H1 check', () => {
  const twoH1s = compile(docWith('<h1>a</h1><h1>b</h1>'));
  assert.ok(twoH1s.findings.some((f) => f.code === 'page/multiple-h1'));

  // An H1 in a block and another inside HTML is still two H1s on the page.
  const mixed = compile({
    version: 1,
    root: [
      { id: 'h', type: 'heading', props: { level: 1, text: 'Bloco' } },
      { id: 'x', type: 'html', props: { html: '<h1>HTML</h1>' } },
    ],
  });
  assert.ok(mixed.findings.some((f) => f.code === 'page/multiple-h1'));
});

// --- integration through the compiler -------------------------------------

test('an html block goes through the compiler with its inline styles intact', () => {
  const result = compile(docWith('<p style="color:red">x</p>'));
  assert.match(result.html, /style="color:red"/);
  assert.equal(result.stats.htmlOptimization.inlineStylesKept, 1);
  // Our own reset steps back inside the author's territory.
  assert.match(result.html, /data-dvf-raw/);
  assert.match(result.css, /\[data-dvf-raw\] img\{max-width:revert;height:revert\}/);
});

test('raw:true publishes the markup untouched', () => {
  const doc: Doc = {
    version: 1,
    root: [{ id: 'b', type: 'html', props: { html: '<p style="color:red">x</p>', raw: true } }],
  };
  const result = compile(doc);
  assert.match(result.html, /style="color:red"/);
  assert.equal(result.stats.htmlOptimization.inlineStylesKept, 0);
});

test('block styles still deduplicate among themselves', () => {
  const doc: Doc = {
    version: 1,
    root: [
      { id: 'a', type: 'text', props: { text: 'a' }, style: { base: { color: 'red' } } },
      { id: 'b', type: 'text', props: { text: 'b' }, style: { base: { color: 'red' } } },
    ],
  };
  const result = compile(doc);
  assert.equal(
    (result.css.match(/color:red/g) ?? []).length,
    1,
    'the same declaration set should be emitted once',
  );
});

// --- the realistic fixture -------------------------------------------------

test('a realistic advertorial page is published faithfully, scoped and audited', () => {
  const source = advertorial();
  const result = compile(docWith(source));
  const { htmlOptimization } = result.stats;

  assert.ok(htmlOptimization.inlineStylesKept >= 15, 'expected many inline styles counted');
  assert.equal(htmlOptimization.styleBlocksScoped, 1);
  assert.ok(htmlOptimization.imagesTouched >= 1);

  // The author's inline styles survive, and nothing global leaks out of our subtree.
  assert.match(result.html, /style="[^"]*:/);
  assert.doesNotMatch(result.css, /(^|\})body\{/);

  // Every inline style the author wrote is still there, character for character.
  const inline = (html: string) => (html.match(/style="[^"]*"/g) ?? []).sort();
  assert.deepEqual(inline(result.html), inline(source), 'no inline style may be rewritten');

  // And the problems in the source are surfaced rather than shipped quietly.
  const codes = result.findings.map((f) => f.code);
  assert.ok(codes.includes('html/click-handler-instead-of-link'));
  assert.ok(codes.includes('html/image-missing-dimensions'));
});
