/**
 * Compiles a block document and reports what came out.
 *
 * Usage: node --experimental-strip-types bin/build.ts [fixture.json]
 *
 * The point of this script is the report, not the files. If the numbers at the
 * bottom do not hold, the architecture thesis does not hold either, and it is
 * much cheaper to find that out here than in Phase 3.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { audit, score } from '../src/audit.ts';
import { compile, toFragment } from '../src/compile.ts';
import type { Doc } from '../src/schema.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/**
 * Shopify refuses to save a theme template larger than this. It is the hard
 * ceiling every page we publish has to fit under.
 */
const TEMPLATE_LIMIT_BYTES = 256 * 1024;

/** Our own target, well below the ceiling, so complex pages still have room. */
const BUDGET_BYTES = 100 * 1024;

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function pct(part: number, whole: number): string {
  return `${((part / whole) * 100).toFixed(1)}%`;
}

const fixture = process.argv[2] ?? join(ROOT, 'fixtures', 'landing.json');

// A .json fixture is a block document; a .html fixture is author-written markup,
// which is how pages are actually authored today (see docs/USO_REAL.md). Both
// go through the same compiler.
const doc: Doc = fixture.endsWith('.html')
  ? {
      version: 1,
      root: [{ id: 'author-html', type: 'html', props: { html: readFileSync(fixture, 'utf8') } }],
    }
  : (JSON.parse(readFileSync(fixture, 'utf8')) as Doc);

const started = performance.now();
const result = compile(doc);
const elapsed = performance.now() - started;

const fragment = toFragment(result);
const outDir = join(ROOT, 'out');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'page.html'), result.html);
writeFileSync(join(outDir, 'page.css'), result.css);
writeFileSync(join(outDir, 'fragment.html'), fragment);
if (result.js) writeFileSync(join(outDir, 'page.js'), result.js);

const { bytes, nodes, cssRules, styleRegistrations, runtimeModules } = result.stats;

console.log(`\nD&VFly — compilação de ${fixture.replace(ROOT + '/', '')}\n`);
console.log(`  Nós na árvore ............ ${nodes}`);
console.log(`  Tempo de compilação ...... ${elapsed.toFixed(1)} ms`);
console.log('');
console.log(`  HTML ..................... ${kb(bytes.html)}`);
console.log(`  CSS ...................... ${kb(bytes.css)}`);
console.log(`  JS ....................... ${result.js ? kb(bytes.js) : '0 B (nenhum bloco pediu)'}`);
console.log(`  Total .................... ${kb(bytes.total)}`);
console.log('');
console.log(`  Teto do template Shopify . ${kb(TEMPLATE_LIMIT_BYTES)} — usando ${pct(bytes.total, TEMPLATE_LIMIT_BYTES)}`);
console.log(`  Nosso orçamento .......... ${kb(BUDGET_BYTES)} — usando ${pct(bytes.total, BUDGET_BYTES)}`);
console.log('');
console.log(`  Regras CSS distintas ..... ${cssRules}`);
console.log(`  Pedidos de estilo ........ ${styleRegistrations}`);
console.log(
  `  Reúso por deduplicação ... ${(styleRegistrations / Math.max(cssRules, 1)).toFixed(1)}× ` +
    `(${styleRegistrations - cssRules} regras não emitidas)`,
);
console.log(
  `  Módulos de runtime ....... ${runtimeModules.length ? runtimeModules.join(', ') : 'nenhum'}`,
);

const opt = result.stats.htmlOptimization;
if (opt.inlineStylesHoisted || opt.styleBlocksScoped || opt.imagesTouched || opt.scriptsFound) {
  console.log('');
  console.log('  Otimização do HTML do autor');
  console.log(`    Estilos inline extraídos . ${opt.inlineStylesHoisted}`);
  console.log(`    Blocos <style> escopados . ${opt.styleBlocksScoped}`);
  console.log(`    Imagens ajustadas ........ ${opt.imagesTouched}`);
  console.log(`    Scripts encontrados ...... ${opt.scriptsFound}`);
}

const findings = [...audit(doc), ...result.findings];
console.log(`\n  Auditoria estática ....... nota ${score(findings)}/100, ${findings.length} achado(s)`);
for (const finding of findings) {
  const mark = finding.severity === 'error' ? '✗' : '!';
  console.log(`    ${mark} [${finding.code}] ${finding.message}${finding.nodeId ? ` (${finding.nodeId})` : ''}`);
}

console.log(`\n  Arquivos escritos em ${outDir.replace(ROOT + '/', '')}/\n`);

if (bytes.total > TEMPLATE_LIMIT_BYTES) {
  console.error('ERRO: a página excede o limite de template da Shopify.');
  process.exit(1);
}
