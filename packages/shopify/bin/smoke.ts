/**
 * End-to-end smoke test against a real store.
 *
 * Compiles a page and deploys it, which is the whole MVP path in one run:
 * author HTML -> compiler -> Shopify page. It targets only stores passed in,
 * leaves the page as a draft, and deletes what it created unless KEEP=1.
 *
 * Usage:
 *   SHOP=... CLIENT_ID=... CLIENT_SECRET=... \
 *     node --experimental-strip-types bin/smoke.ts
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile, toFragment } from '../../compiler/src/compile.ts';
import type { Doc } from '../../compiler/src/schema.ts';
import { ShopifyClient } from '../src/client.ts';
import { deployPage, formatDeployResult, type Store } from '../src/deploy.ts';
import { deletePage } from '../src/pages.ts';

const { SHOP, CLIENT_ID, CLIENT_SECRET, KEEP } = process.env;
if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('Defina SHOP, CLIENT_ID e CLIENT_SECRET.');
  process.exit(1);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(HERE, '../../compiler/fixtures/advertorial.html'),
  'utf8',
);

const doc: Doc = {
  version: 1,
  root: [{ id: 'author-html', type: 'html', props: { html: source } }],
};

console.log('\nD&VFly — smoke test ponta a ponta\n');

const compiled = compile(doc);
const fragment = toFragment(compiled);
console.log(`  compilado ......... ${(compiled.stats.bytes.total / 1024).toFixed(1)} KB`);
console.log(`  estilos extraídos . ${compiled.stats.htmlOptimization.inlineStylesHoisted}`);
console.log(`  regras CSS ........ ${compiled.stats.cssRules}`);
console.log(`  achados ........... ${compiled.findings.length}`);

const store: Store = {
  domain: SHOP,
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  label: 'loja de teste',
};

const handle = `dvfly-smoke-${Date.now()}`;
console.log(`\n  publicando "${handle}"...\n`);

const result = await deployPage([store], {
  title: 'D&VFly — smoke test',
  handle,
  body: fragment,
});
console.log(formatDeployResult(result));

const created = result.succeeded[0]?.page;
if (created && KEEP !== '1') {
  await deletePage(new ShopifyClient(store), created.id);
  console.log('\n  página de teste removida (KEEP=1 para manter).\n');
} else if (created) {
  console.log(`\n  mantida: https://${SHOP}/pages/${created.handle}\n`);
}

process.exit(result.failed.length > 0 ? 1 : 0);
