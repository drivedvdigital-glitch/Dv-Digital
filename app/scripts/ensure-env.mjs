/**
 * Creates `app/.env` from `.env.example` on first setup.
 *
 * `.env` is untracked — it is where a developer's local overrides go — so a
 * fresh clone has no DATABASE_URL and every Prisma command fails before the app
 * ever starts. Copying the example removes that step from the person setting the
 * project up, which is the only kind of setup step that never gets skipped.
 *
 * Written in Node rather than the shell because the project is developed on both
 * Windows and Linux, and `cp` is not a command on one of them.
 */

import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(appDir, '.env');
const example = join(appDir, '.env.example');

if (existsSync(target)) {
  console.log('.env já existe, mantido como está.');
} else if (existsSync(example)) {
  copyFileSync(example, target);
  console.log('.env criado a partir de .env.example.');
} else {
  console.error('.env.example não encontrado — nada a copiar.');
  process.exit(1);
}
