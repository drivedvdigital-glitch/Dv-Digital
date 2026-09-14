/**
 * Creates `app/.env` from `.env.example` on first setup — and keeps it fed.
 *
 * `.env` is untracked — it is where a developer's local overrides go — so a
 * fresh clone has no DATABASE_URL and every Prisma command fails before the app
 * ever starts. Copying the example removes that step from the person setting the
 * project up, which is the only kind of setup step that never gets skipped.
 *
 * On later runs, keys that exist in the example but are missing from the local
 * `.env` are appended. That is how a machine that set up before a new variable
 * existed picks it up on the next `npm run setup`, without touching any value
 * the person changed locally. Nothing is ever overwritten or removed.
 *
 * Written in Node rather than the shell because the project is developed on both
 * Windows and Linux, and `cp` is not a command on one of them.
 */

import { appendFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(appDir, '.env');
const example = join(appDir, '.env.example');

if (!existsSync(example)) {
  console.error('.env.example não encontrado — nada a copiar.');
  process.exit(1);
}

if (!existsSync(target)) {
  copyFileSync(example, target);
  console.log('.env criado a partir de .env.example.');
  process.exit(0);
}

/** KEY of every `KEY=value` line, comments ignored. */
const keysOf = (content) =>
  new Set(
    content
      .split(/\r?\n/)
      .map((line) => /^\s*([A-Z0-9_]+)\s*=/.exec(line)?.[1])
      .filter(Boolean),
  );

const have = keysOf(readFileSync(target, 'utf8'));
const exampleLines = readFileSync(example, 'utf8').split(/\r?\n/);

const missing = [];
let pendingComments = [];
for (const line of exampleLines) {
  if (/^\s*#/.test(line)) {
    pendingComments.push(line);
    continue;
  }
  const key = /^\s*([A-Z0-9_]+)\s*=/.exec(line)?.[1];
  if (key && !have.has(key)) {
    missing.push('', ...pendingComments, line);
  }
  pendingComments = [];
}

if (missing.length === 0) {
  console.log('.env já existe e tem todas as chaves, mantido como está.');
} else {
  appendFileSync(target, missing.join('\n') + '\n');
  const added = missing.filter((l) => /^[A-Z0-9_]+=/.test(l.trim())).length;
  console.log(`.env atualizado: ${added} chave(s) nova(s) vinda(s) do .env.example.`);
}
