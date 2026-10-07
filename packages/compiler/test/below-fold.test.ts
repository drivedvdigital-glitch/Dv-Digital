/**
 * Sections of a pasted landing page that render when scrolled to.
 *
 * A whole LP lives in one html block, so the top-level rule (section blocks
 * after the first get `dvf-below`) never reached inside it; this was added by
 * hand to every LP. These tests pin what the compiler now picks on its own,
 * and — more important — what it must leave alone.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compile } from '../src/compile.ts';
import type { Doc, Node } from '../src/schema.ts';

const HERO = 'https://cdn.shopify.com/s/files/1/0604/3985/5190/files/HERO.jpg?v=1';
const PHOTO = 'https://cdn.shopify.com/s/files/1/0604/3985/5190/files/FOTO.jpg?v=1';

const section = (id: string, extra = '') =>
  `<section class="sec" id="${id}"><h2>${id}</h2><p>texto</p>${extra}</section>`;

/** The shape of every LP pasted so far: a wrapper, a hero, bands, sections, a sticky bar. */
const lp = (opts: { css?: string; sections?: string; before?: string } = {}) => `
<link rel="preconnect" href="https://fonts.googleapis.com">
<div id="lp">
<style>#lp .sticky{position:fixed;left:0;right:0;bottom:0}#lp .sticky.show{transform:none}${opts.css ?? ''}</style>
${opts.before ?? ''}
<section class="hero"><h1>Oferta</h1><img src="${HERO}" alt="Produto" width="800" height="800"></section>
<div class="divider"><svg viewBox="0 0 10 1"></svg></div>
${opts.sections ?? section('a') + section('b', `<img src="${PHOTO}" alt="Foto" width="600" height="450">`) + section('c') + section('d')}
<div class="sticky"><a href="javascript:void(0)" class="btn">Comprar</a></div>
<script>document.getElementById('lp').className+=' js';</script>
</div>`;

const page = (html: string, before: Node[] = []): Doc => ({
  version: 1,
  root: [...before, { id: 'lp', type: 'html', props: { html } }],
});

const marked = (html: string): string[] =>
  [...html.matchAll(/<(\w+)[^>]*?(?:id="([^"]*)")?[^>]*\sdata-dvf-below[^>]*>/g)].map((m) => {
    const id = /id="([^"]*)"/.exec(m[0]);
    return id ? id[1] : `<${m[1]} class="${/class="([^"]*)"/.exec(m[0])?.[1] ?? ''}">`;
  });

test('the sections of a pasted page after the first screen render later; hero, dividers and the sticky bar never', () => {
  const out = compile(page(lp()));
  assert.deepEqual(marked(out.html), ['a', 'b', 'c', 'd']);
  assert.equal(out.stats.htmlOptimization.sectionsDeferred, 4);
  assert.match(out.css, /\.dvf-page \[data-dvf-below\]\{content-visibility:auto;contain-intrinsic-size:auto 600px\}/);
  assert.match(out.css, /\.dvf-laid \[data-dvf-below\]\{content-visibility:visible\}/);
  assert.deepEqual(out.stats.runtimeModules, ['below']);
  // Without scripted scroll, only a jump to a place on the page lays it out —
  // never a bare href="#", which is how popup buy buttons are written.
  assert.ok(out.js.includes('closest("a[href*=\\"#\\"]:not([href=\\"#\\"])")'), out.js);
});

test('the first screen reaches down to the section holding the hero', () => {
  // A top bar first, the hero in the second section: both stay.
  const out = compile(
    page(
      lp({
        before: '<section class="topbar"><h2>Envío gratis</h2></section>',
      }),
    ),
  );
  assert.deepEqual(marked(out.html), ['a', 'b', 'c', 'd']);
  assert.doesNotMatch(out.html, /class="topbar"[^>]*data-dvf-below/);
  assert.doesNotMatch(out.html, /class="hero"[^>]*data-dvf-below/);
});

test('a short page, or one whose author handles content-visibility, is left exactly as pasted', () => {
  const short = compile(page(lp({ sections: section('a') + section('b') })));
  assert.deepEqual(marked(short.html), [], 'two sections below the fold is not a long page');
  assert.doesNotMatch(short.css, /data-dvf-below/, 'the rule ships only when something uses it');
  assert.deepEqual(short.stats.runtimeModules, []);

  const own = compile(page(lp({ css: '#lp .sec{content-visibility:auto}' })));
  assert.deepEqual(marked(own.html), []);
});

test('a section holding anything the author pins to the screen never waits', () => {
  const pinnedInside = (css: string, inner: string) =>
    compile(page(lp({ css, sections: section('a') + section('b', inner) + section('c') + section('d') })));

  // A floating button inside a section, by class, by a state class added by
  // script, by a pseudo-element, and by inline style.
  for (const [css, inner] of [
    ['#lp .float{position:fixed;bottom:0}', '<a class="float" href="#">WhatsApp</a>'],
    ['#lp .bar.is-open{position:sticky;top:0}', '<div class="bar">x</div>'],
    ['@media (max-width:600px){#lp .badge::after{content:"";position:fixed}}', '<span class="badge">x</span>'],
    ['', '<div style="position: fixed; top:0">x</div>'],
  ]) {
    assert.deepEqual(marked(pinnedInside(css, inner).html), ['a', 'c', 'd'], css || 'inline style');
  }

  // A script that pins something itself is out of reach of the CSS read: mark nothing.
  for (const script of ["bar.style.position='fixed'", "bar.style.setProperty('position', 'sticky')", 'bar.style.cssText="position: fixed;top:0"']) {
    const out = compile(page(lp().replace('</script>', `var bar=document.querySelector('.sec');${script};</script>`)));
    assert.deepEqual(marked(out.html), [], script);
  }

  // A pinning rule the compiler cannot match statically: mark nothing.
  assert.deepEqual(marked(pinnedInside('#lp p:lang(es){position:fixed}', '').html), []);
  assert.deepEqual(marked(pinnedInside('#lp .bar:is(.open){position:fixed}', '').html), []);
});

test('only a pasted page at the top of the document defers its sections', () => {
  const nested = compile({
    version: 1,
    root: [
      { id: 'h', type: 'heading', props: { level: 1, text: 'Topo' } },
      { id: 's', type: 'section', children: [{ id: 'lp', type: 'html', props: { html: lp() } }] },
    ],
  });
  assert.deepEqual(marked(nested.html), [], 'nested in a section, the block does not own the page');
  // …and that section itself must not be contained either: the LP's fixed
  // sticky bar would be fixed to the section instead of to the screen.
  assert.doesNotMatch(nested.html, /<section class="dvf-below"/);

  // A plain section after the pasted page still waits, as before.
  const after = compile({
    version: 1,
    root: [
      { id: 'lp', type: 'html', props: { html: lp() } },
      { id: 's', type: 'section', children: [{ id: 't', type: 'text', props: { text: 'x' } }] },
    ],
  });
  assert.match(after.html, /<section class="dvf-below">/);
  assert.deepEqual(marked(after.html), ['a', 'b', 'c', 'd']);
});

test('a page that scrolls from its own script lays everything out on any click first', () => {
  const html = lp().replace(
    '</script>',
    "document.querySelector('.btn').onclick=function(){document.getElementById('d').scrollIntoView({behavior:'smooth'})};</script>",
  );
  const out = compile(page(html));
  assert.ok(out.js.includes('closest("a[href*=\\"#\\"]:not([href=\\"#\\"]),.dvf-page")'), out.js);
  assert.match(out.js, /location\.hash/, 'landing on #section lays the page out too');
});

test('Liquid in the pasted page does not stop its sections from deferring', () => {
  const out = compile(page(lp({ sections: section('a', '{{ shop.name }}') + section('b') + section('c') })));
  assert.deepEqual(marked(out.html), ['a', 'b', 'c']);
  assert.match(out.html, /\{\{ shop\.name \}\}/);
});

test('lazy images keep our sizes: never sizes="auto", which changes the layout', () => {
  // `sizes="auto"` would let the browser pick the file by the width an image
  // really takes. But the browser's own stylesheet gives such an image
  // `contain:size` with a 300x150 intrinsic size, and that is layout: on the
  // camera LP (07/10) the three step cards grew from 316 to 345px and the
  // grid ran out of its container at 1280px. What the visitor sees wins.
  const out = compile(
    page(
      `<img src="${HERO}" alt="Hero" width="800" height="800">` + `<img src="${PHOTO}" alt="A" width="600" height="450">`,
    ),
  );
  const [, lazy] = out.html.match(/<img[^>]*>/g)!;
  assert.match(lazy, /loading="lazy"/);
  assert.match(lazy, /sizes="\(min-width: 600px\) 600px, 100vw"/);
  assert.doesNotMatch(out.html, /sizes="auto/);
});
