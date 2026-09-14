/**
 * Fails the setup when a second copy of React is installed.
 *
 * This repo became an npm workspace after people had already run `npm install`
 * inside `app/`. That leaves an `app/node_modules` behind, and nothing removes
 * it: the root install writes its own tree and ignores the old one. Module
 * resolution then walks up from `app/app/routes/*` and finds the *stale* React
 * first, while react-router — resolved from the root — finds the hoisted one.
 *
 * Two Reacts means the hooks dispatcher is null for one of them, and every
 * route dies with "Cannot read properties of null (reading 'useContext')". That
 * message names nothing useful, so the person debugging it has no thread to
 * pull. Hence this check: it turns a baffling runtime error into a sentence
 * that says which directory to delete.
 *
 * A single root install produces no nested `node_modules` for this project, so
 * a nested React here is always the stale kind and never something npm needed.
 */

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/** Every workspace that could be hiding an install from before the migration. */
const workspaces = ['app', 'packages/compiler', 'packages/shopify'];

const versionOf = (dir) => {
  const manifest = join(dir, 'package.json');
  if (!existsSync(manifest)) return null;
  try {
    return JSON.parse(readFileSync(manifest, 'utf8')).version ?? 'desconhecida';
  } catch {
    return 'ilegível';
  }
};

const rootReact = versionOf(join(root, 'node_modules', 'react'));
const strays = workspaces
  .map((workspace) => ({
    workspace,
    dir: join(root, workspace, 'node_modules'),
    react: versionOf(join(root, workspace, 'node_modules', 'react')),
  }))
  .filter((candidate) => candidate.react !== null);

if (strays.length === 0) {
  process.exit(0);
}

const shouldFix = process.argv.includes('--fix');

console.error('');
console.error('  ⚠  Instalação duplicada do React encontrada.');
console.error('');
console.error(`     Na raiz:  react ${rootReact ?? '(ausente)'}`);
for (const stray of strays) {
  console.error(`     Sobrando: react ${stray.react} em ${relative(root, stray.dir)}`);
}
console.error('');
console.error('     Sobra de um `npm install` rodado dentro da pasta, de antes deste');
console.error('     repositório virar workspace. Com duas cópias do React, toda tela quebra');
console.error("     com \"Cannot read properties of null (reading 'useContext')\".");
console.error('');

if (!shouldFix) {
  console.error('     Para resolver, rode na raiz:');
  console.error('');
  console.error('       npm run fix:duplicados');
  console.error('');
  process.exit(1);
}

for (const stray of strays) {
  rmSync(stray.dir, { recursive: true, force: true });
  console.error(`     ✓ removido ${relative(root, stray.dir)}`);
}
console.error('');
console.error('     Agora rode: npm run setup');
console.error('');
