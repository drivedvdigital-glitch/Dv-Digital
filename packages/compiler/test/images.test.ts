/**
 * Images sized for the screen, and the LCP image fetched first.
 *
 * These guard what the first live product page taught (docs/PROGRESSO.md,
 * 21/09): LCP 3.1 s in the field with a 250 KB hero shipped at full size and
 * no priority. Shopify's own rules — never lazy-load the LCP image, give it
 * fetchpriority, serve a srcset through the CDN resizer — are the compiler's
 * job. If these go red, the page is slow again for the way the tool is used.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { audit } from '../src/audit.ts';
import { compile } from '../src/compile.ts';
import { StyleSheet } from '../src/css.ts';
import { optimizeHtml } from '../src/html-optimize.ts';
import {
  cdnWidth,
  isAuthorSized,
  isShopifyCdn,
  placeholderHost,
  responsiveImage,
  SRCSET_WIDTHS,
} from '../src/images.ts';
import type { Doc } from '../src/schema.ts';

// The two shapes seen on a real storefront on 21/09.
const SHARED = 'https://cdn.shopify.com/s/files/1/0854/7686/8338/files/clean-2_galeria.webp?v=1790014608';
const SHOP = '//snevy.co/cdn/shop/files/foto.jpg?v=123';

const run = (html: string, imageOffset = 0) =>
  optimizeHtml(html, { sheet: new StyleSheet(), scope: 'dvf-page', imageOffset });

// --- the CDN helper ---------------------------------------------------------

test('both Shopify CDN shapes are recognised; other hosts are not', () => {
  assert.ok(isShopifyCdn(SHARED));
  assert.ok(isShopifyCdn(SHOP));
  assert.ok(isShopifyCdn('https://loja.com/cdn/shop/files/x.png'));
  assert.equal(isShopifyCdn('https://via.placeholder.com/720x480'), false);
  assert.equal(isShopifyCdn('/local.jpg'), false);
  assert.equal(isShopifyCdn('https://cdn.shopify.com/shopifycloud/app-bridge.js'), false, 'scripts are not files');
});

test('cdnWidth adds the width and keeps the version', () => {
  assert.equal(cdnWidth(SHARED, 720), SHARED + '&width=720');
  assert.equal(cdnWidth('//x.com/cdn/shop/files/a.jpg', 360), '//x.com/cdn/shop/files/a.jpg?width=360');
  assert.equal(cdnWidth('//x.com/cdn/shop/files/a.jpg?width=99', 360), '//x.com/cdn/shop/files/a.jpg?width=360', 'replaces, never duplicates');
});

test("an author's own sizing in the URL is left alone", () => {
  for (const url of [SHARED + '&width=400', SHARED + '&height=400', SHARED + '&crop=center']) {
    assert.ok(isAuthorSized(url), url);
    assert.equal(responsiveImage(url), null, url);
  }
  assert.equal(responsiveImage('https://outro.com/foto.jpg'), null, 'nothing to resize off the CDN');
});

test('a CDN image with no declared width spans the viewport: full srcset, sizes 100vw', () => {
  const r = responsiveImage(SHARED)!;
  assert.match(r.src, /&width=1080$/, 'the fallback src is laptop-sized, not wall-sized');
  assert.equal(r.sizes, '100vw');
  const widths = [...r.srcset.matchAll(/ (\d+)w/g)].map((m) => Number(m[1]));
  assert.deepEqual(widths, [...SRCSET_WIDTHS]);
});

test('a declared width caps the candidates at 2× (retina) and tells the browser the limit', () => {
  const r = responsiveImage(SHARED, { width: 600 })!;
  const widths = [...r.srcset.matchAll(/ (\d+)w/g)].map((m) => Number(m[1]));
  assert.deepEqual(widths, [360, 540, 600, 720, 900, 1080, 1200]);
  assert.equal(r.sizes, '(min-width: 600px) 600px, 100vw');
  // A thumbnail: nothing in the standard list fits, so 1× and 2× of it.
  const thumb = responsiveImage(SHARED, { width: 120 })!;
  assert.deepEqual([...thumb.srcset.matchAll(/ (\d+)w/g)].map((m) => Number(m[1])), [120, 240]);
  assert.match(thumb.src, /&width=240$/);
});

test("the author's sizes attribute wins over the computed one", () => {
  assert.equal(responsiveImage(SHARED, { sizes: '(min-width: 900px) 50vw, 100vw' })!.sizes, '(min-width: 900px) 50vw, 100vw');
});

test('placeholder services are named; real hosts are not', () => {
  assert.equal(placeholderHost('https://via.placeholder.com/720x480/EAD8DA/A0525A'), 'via.placeholder.com');
  assert.equal(placeholderHost('https://picsum.photos/200'), 'picsum.photos');
  assert.equal(placeholderHost(SHARED), null);
  assert.equal(placeholderHost('/local.jpg'), null);
  assert.equal(placeholderHost('https://placeholder.com.br/x.jpg'), null, 'a look-alike domain is not the service');
});

// --- pasted HTML -------------------------------------------------------------

test('a pasted CDN image leaves with src/srcset/sizes; the first one is the LCP image', () => {
  const r = run(`<img src="${SHARED}" alt="Hero"><img src="${SHARED}" alt="Depois" width="400">`);
  const [hero, second] = r.html.match(/<img[^>]*>/g)!;
  assert.match(hero, /srcset="[^"]*width=360 360w[^"]*width=2048 2048w"/);
  assert.match(hero, /sizes="100vw"/);
  assert.match(hero, /fetchpriority="high"/);
  assert.doesNotMatch(hero, /loading=/);
  assert.match(second, /loading="lazy"/);
  assert.match(second, /sizes="\(min-width: 400px\) 400px, 100vw"/);
  assert.doesNotMatch(second, /fetchpriority/);
  assert.equal(r.stats.imagesFound, 2);
  assert.equal(r.stats.imagesResponsive, 2);
  assert.match(r.stats.firstImage!.src, /width=1080/);
});

test('an image the page already counted before this block is not crowned hero twice', () => {
  const r = run(`<img src="${SHARED}" alt="">`, 3);
  assert.match(r.html, /loading="lazy"/);
  assert.doesNotMatch(r.html, /fetchpriority/);
  assert.equal(r.stats.firstImage, null);
});

test("a pasted srcset of the author's own is respected untouched", () => {
  const r = run(`<img src="${SHARED}" srcset="${SHARED} 1x" alt="">`);
  assert.match(r.html, new RegExp(`srcset="${SHARED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} 1x"`));
  assert.equal(r.stats.imagesResponsive, 0);
});

test('a placeholder image in pasted HTML is an error the editor can show', () => {
  const r = run('<img src="https://via.placeholder.com/720x480" alt="">');
  const finding = r.findings.find((f) => f.code === 'html/image-placeholder');
  assert.ok(finding);
  assert.equal(finding.severity, 'error');
  assert.match(finding.message, /via\.placeholder\.com/);
});

// --- the whole page ----------------------------------------------------------

test('"first image" is a fact about the page: the counter runs across blocks', () => {
  const doc: Doc = {
    version: 1,
    root: [
      { id: 'h', type: 'html', props: { html: `<img src="${SHARED}" alt="No HTML">` } },
      { id: 'i', type: 'image', props: { src: SHOP, alt: 'No bloco', width: 800, height: 600 } },
      { id: 'h2', type: 'html', props: { html: '<img src="/c.jpg" alt="Outro HTML">' } },
    ],
  };
  const result = compile(doc);
  const tags = result.html.match(/<img[^>]*>/g)!;
  assert.equal(tags.length, 3);
  assert.match(tags[0], /fetchpriority="high"/);
  assert.match(tags[1], /loading="lazy"/, 'the block image comes second, so it is lazy');
  assert.match(tags[1], /srcset="[^"]*cdn\/shop\/files\/foto\.jpg\?v=123&(?:amp;)?width=360 360w/);
  assert.match(tags[2], /loading="lazy"/, 'the second HTML block is not a new page');
  assert.doesNotMatch(tags[2], /fetchpriority/);
  assert.equal(result.stats.images.total, 3);
  assert.equal(result.stats.images.responsive, 2);
  assert.match(result.stats.images.lcp!, /clean-2_galeria/);
});

test('the LCP image is preloaded at the top of the fragment, with the same candidates', () => {
  const result = compile({
    version: 1,
    root: [{ id: 'i', type: 'image', props: { src: SHARED, alt: 'Hero', width: 1200, height: 800 } }],
  });
  const link = result.html.match(/<link[^>]*>/)![0];
  assert.match(link, /^<link rel="preload" as="image" href="[^"]*width=1080"/);
  assert.match(link, /imagesrcset="[^"]*width=2048 2048w"/);
  assert.match(link, /imagesizes="\(min-width: 1200px\) 1200px, 100vw"/);
  assert.match(link, /fetchpriority="high">$/);
  assert.ok(result.html.indexOf('<link') < result.html.indexOf('<img'), 'before the tag, or it is pointless');
  // Void element: no closing tag leaks into the page.
  assert.doesNotMatch(result.html, /<\/link>/);
});

test('a page with no image preloads nothing and says so', () => {
  const result = compile({ version: 1, root: [{ id: 't', type: 'text', props: { text: 'oi' } }] });
  assert.doesNotMatch(result.html, /<link/);
  assert.equal(result.stats.images.lcp, null);
  assert.equal(result.stats.images.total, 0);
});

test('a hidden image is not on the page, so it is not the LCP image', () => {
  const result = compile({
    version: 1,
    root: [
      { id: 'x', type: 'image', props: { src: '/oculta.jpg', alt: '' }, hidden: true },
      { id: 'y', type: 'image', props: { src: '/visivel.jpg', alt: '' } },
    ],
  });
  assert.equal(result.stats.images.lcp, '/visivel.jpg');
  assert.match(result.html, /href="\/visivel\.jpg"/);
});

test('an image block pointing at a placeholder service is an error with the field to fix', () => {
  const findings = audit({
    version: 1,
    root: [{ id: 'i', type: 'image', props: { src: 'https://via.placeholder.com/600x600', alt: '', width: 600, height: 600 } }],
  });
  const finding = findings.find((f) => f.code === 'image/placeholder');
  assert.ok(finding);
  assert.equal(finding.nodeId, 'i');
  assert.match(finding.message, /URL da imagem/);
});
