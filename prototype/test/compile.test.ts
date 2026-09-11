/**
 * These tests exist to lock in the architectural invariants, not to reach
 * coverage. Each one corresponds to a promise made in docs/ARQUITETURA.md; if a
 * test here goes red, a promise broke.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { audit, score } from '../src/audit.ts';
import { compile } from '../src/compile.ts';
import type { Doc } from '../src/schema.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const landing = () =>
  JSON.parse(readFileSync(join(ROOT, 'fixtures', 'landing.json'), 'utf8')) as Doc;

test('the compiler is pure: the same document compiles byte-identically', () => {
  const a = compile(landing());
  const b = compile(landing());
  assert.equal(a.html, b.html);
  assert.equal(a.css, b.css);
  assert.equal(a.js, b.js);
});

test('a realistic landing page fits well under the Shopify template ceiling', () => {
  const { stats } = compile(landing());
  assert.ok(
    stats.bytes.total < 100 * 1024,
    `expected under 100 KB, got ${(stats.bytes.total / 1024).toFixed(1)} KB`,
  );
});

test('repeated rows share one CSS rule instead of one rule each', () => {
  const { stats } = compile(landing());
  // Twelve testimonials and six benefit cards all reuse the same declarations.
  assert.ok(
    stats.styleRegistrations > stats.cssRules * 2,
    `expected meaningful deduplication, got ${stats.styleRegistrations} registrations ` +
      `across ${stats.cssRules} rules`,
  );
});

test('no JavaScript is emitted unless a block asks for it', () => {
  const noRuntime: Doc = {
    version: 1,
    root: [
      { id: 'h', type: 'heading', props: { level: 1, text: 'Olá' } },
      { id: 'a', type: 'accordion', props: { items: [{ title: 'T', body: 'B' }] } },
    ],
  };
  const result = compile(noRuntime);
  assert.equal(result.js, '');
  assert.deepEqual(result.stats.runtimeModules, []);
  // The accordion still works: it is a native disclosure element.
  assert.match(result.html, /<details/);
  assert.match(result.html, /<summary/);
});

test('the countdown is the only block that pulls in a runtime module', () => {
  const result = compile({
    version: 1,
    root: [{ id: 'c', type: 'countdown', props: { deadline: '2027-01-01T00:00:00Z' } }],
  });
  assert.deepEqual(result.stats.runtimeModules, ['countdown']);
  assert.ok(result.stats.bytes.js < 512, 'the runtime module should stay tiny');
});

test('a link renders as a real anchor, not a div with a handler', () => {
  const result = compile({
    version: 1,
    root: [{ id: 'b', type: 'button', props: { label: 'Ir', href: '/collections/all' } }],
  });
  assert.match(result.html, /<a [^>]*href="\/collections\/all"[^>]*>Ir<\/a>/);
});

test('a button with no destination renders as a button element', () => {
  const result = compile({
    version: 1,
    root: [{ id: 'b', type: 'button', props: { label: 'Abrir' } }],
  });
  assert.match(result.html, /<button [^>]*type="button"[^>]*>Abrir<\/button>/);
});

test('unsafe link destinations are dropped rather than emitted', () => {
  const result = compile({
    version: 1,
    // eslint-disable-next-line no-script-url
    root: [{ id: 'b', type: 'button', props: { label: 'X', href: 'javascript:alert(1)' } }],
  });
  assert.doesNotMatch(result.html, /javascript:/);
  assert.match(result.html, /<button/);
});

test('author text is escaped', () => {
  const result = compile({
    version: 1,
    root: [{ id: 't', type: 'text', props: { text: '<script>alert(1)</script>' } }],
  });
  assert.doesNotMatch(result.html, /<script>alert/);
  assert.match(result.html, /&lt;script&gt;/);
});

test('images carry dimensions and lazy loading by default', () => {
  const result = compile({
    version: 1,
    root: [
      {
        id: 'i',
        type: 'image',
        props: { src: '/a.jpg', alt: 'Um gato', width: 800, height: 600 },
      },
    ],
  });
  assert.match(result.html, /width="800"/);
  assert.match(result.html, /height="600"/);
  assert.match(result.html, /loading="lazy"/);
});

test('an image marked eager opts out of lazy loading', () => {
  const result = compile({
    version: 1,
    root: [
      {
        id: 'i',
        type: 'image',
        props: { src: '/a.jpg', alt: '', width: 8, height: 6, eager: true },
      },
    ],
  });
  assert.doesNotMatch(result.html, /loading=/);
});

test('every emitted class is namespaced, so the theme cannot collide with us', () => {
  const { html, css } = compile(landing());
  for (const match of html.matchAll(/class="([^"]+)"/g)) {
    for (const name of match[1].split(/\s+/)) {
      assert.ok(name.startsWith('dvf'), `unprefixed class: ${name}`);
    }
  }
  for (const match of css.matchAll(/\.([A-Za-z][\w-]*)/g)) {
    assert.ok(match[1].startsWith('dvf'), `unprefixed selector: ${match[1]}`);
  }
});

test('breakpoint overrides are emitted as min-width queries, mobile first', () => {
  const { css } = compile(landing());
  assert.match(css, /@media\(min-width:768px\)/);
  // Base rules must come before the overrides or the cascade inverts.
  assert.ok(css.indexOf('@media') > css.indexOf('.dvf-page{'));
});

test('an unknown block fails loudly instead of publishing a hole in the page', () => {
  assert.throws(
    () => compile({ version: 1, root: [{ id: 'x', type: 'wat' as never }] }),
    /unknown block type/,
  );
});

test('duplicate node ids are rejected', () => {
  assert.throws(
    () =>
      compile({
        version: 1,
        root: [
          { id: 'same', type: 'text', props: { text: 'a' } },
          { id: 'same', type: 'text', props: { text: 'b' } },
        ],
      }),
    /duplicate node id/,
  );
});

test('the static audit catches what an "AI page checkup" charges for', () => {
  const bad: Doc = {
    version: 1,
    root: [
      { id: 'h2', type: 'heading', props: { level: 2, text: 'Lorem ipsum dolor' } },
      { id: 'h4', type: 'heading', props: { level: 4, text: 'Pulou um nível' } },
      { id: 'img', type: 'image', props: { src: '/a.jpg' } },
    ],
  };
  const findings = audit(bad);
  const codes = findings.map((f) => f.code);

  assert.ok(codes.includes('heading/no-h1'));
  assert.ok(codes.includes('heading/skipped-level'));
  assert.ok(codes.includes('image/missing-alt'));
  assert.ok(codes.includes('image/missing-dimensions'));
  assert.ok(codes.includes('content/placeholder'));
  assert.ok(codes.includes('cta/none'));
  assert.ok(score(findings) < 60);
});

test('a decorative image with an explicit empty alt is not flagged', () => {
  const findings = audit({
    version: 1,
    root: [
      { id: 'h', type: 'heading', props: { level: 1, text: 'Título' } },
      { id: 'b', type: 'button', props: { label: 'Ir', href: '/' } },
      { id: 'i', type: 'image', props: { src: '/a.svg', alt: '', width: 40, height: 40 } },
    ],
  });
  assert.deepEqual(findings, []);
});

test('the shipped fixture is a clean page', () => {
  assert.equal(score(audit(landing())), 100);
});
