import assert from 'node:assert/strict';
import { test } from 'node:test';

import { StyleSheet } from '../src/css.ts';
import { optimizeHtml } from '../src/html-optimize.ts';

const run = (html: string) => {
  const sheet = new StyleSheet();
  return optimizeHtml(html, { sheet, scope: 'dvf-page' });
};

// --- motion that costs the phone its main thread ---------------------------

test('a keyframes that animates box-shadow is flagged, with the fix, only when a rule plays it', () => {
  const css =
    '@keyframes glow{0%,100%{box-shadow:0 0 0 rgba(0,0,0,.2)}50%{box-shadow:0 0 24px rgba(0,0,0,.6)}}' +
    '@keyframes unused{from{width:0}to{width:100%}}' +
    '.cta{animation:glow 1.6s ease-in-out infinite}';
  const result = run(`<style>${css}</style><a class="cta" href="/x">Comprar</a>`);
  const hits = result.findings.filter((f) => f.code === 'html/animation-repaints');
  assert.equal(hits.length, 1, JSON.stringify(result.findings));
  assert.equal(hits[0].severity, 'warning');
  assert.match(hits[0].message, /«glow»/);
  assert.match(hits[0].message, /box-shadow/);
  assert.match(hits[0].message, /infinite/);
  assert.match(hits[0].message, /prefers-reduced-motion/, 'no reduced-motion rule in the sheet: say so');
  assert.match(hits[0].message, /transform e opacity/);
  assert.doesNotMatch(hits[0].message, /unused|width/, 'a keyframes nobody plays is not worth a warning');
  // Reported, never rewritten.
  assert.match(result.html, /box-shadow:0 0 24px/);
});

test('transform/opacity keyframes and a reduced-motion rule produce no motion finding', () => {
  const css =
    '@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.4)}}' +
    '.dot{animation:pulse 1.4s ease-in-out infinite}.btn{transition:opacity .2s,transform .3s cubic-bezier(.16,1,.3,1)}' +
    '@media (prefers-reduced-motion:reduce){.dot{animation:none !important}}';
  const result = run(`<style>${css}</style><span class="dot"></span>`);
  assert.deepEqual(result.findings.filter((f) => f.code.startsWith('html/animation') || f.code === 'html/expensive-effects'), []);
});

test('a layout property in a keyframes says so, and a mentioned reduced-motion rule is not asked for again', () => {
  const css =
    '@media (prefers-reduced-motion:no-preference){.bar{animation-name:grow;animation-duration:2s;animation-iteration-count:infinite}}' +
    '@keyframes grow{from{width:0;background-position:0 0}to{width:100%;background-position:100% 0}}';
  const result = run(`<style>${css}</style><div class="bar"></div>`);
  const [hit] = result.findings.filter((f) => f.code === 'html/animation-repaints');
  assert.ok(hit);
  assert.match(hit.message, /«grow» \(em \.bar\) anima width, background-position: recalcula o layout/);
  assert.match(hit.message, /infinite/);
  assert.doesNotMatch(hit.message, /Não há @media/);
});

test('transitions on layout/paint properties and expensive effects are info, not warnings', () => {
  const css =
    '.fill{transition:width .8s cubic-bezier(.16,1,.3,1)}.tab{transition:all .25s}.arrow{transition:transform .25s}.link{transition:color .2s}' +
    '.glass{backdrop-filter:blur(12px)}.soft{filter:blur(4px)}.bg{filter:blur(40px)}' +
    '.a,.b{will-change:transform}.c{will-change:transform}.d{will-change:opacity}.e{will-change:transform}.f{will-change:transform}.g{will-change:auto}';
  const result = run(`<style>${css}</style><div class="fill"></div>`);
  const motion = result.findings.filter((f) => f.code === 'html/animation-repaints');
  assert.equal(motion.length, 1);
  assert.equal(motion[0].severity, 'info');
  assert.match(motion[0].message, /\.fill \(width\); \.tab \(all\)/);
  assert.doesNotMatch(motion[0].message, /\.arrow|\.link/, 'transform, and a short paint-only hover, are not noise worth printing');
  const effects = result.findings.filter((f) => f.code === 'html/expensive-effects');
  assert.equal(effects.length, 1);
  assert.equal(effects[0].severity, 'info');
  assert.match(effects[0].message, /\.glass: backdrop-filter; \.bg: filter blur\(40px\)/);
  assert.doesNotMatch(effects[0].message, /\.soft|will-change em \d/, 'a 4px blur and 5 will-change rules are within budget');
});
