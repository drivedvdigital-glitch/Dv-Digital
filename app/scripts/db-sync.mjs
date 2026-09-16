/**
 * Brings the database up to date, whichever database it is.
 *
 * Postgres (a server) runs `prisma migrate deploy`: the migrations in
 * `prisma/migrations/` are applied in order, once, and recorded. That is the
 * only safe way to change a database that holds someone's pages.
 *
 * SQLite (a laptop) runs `prisma db push`: the local file is disposable, the
 * migrations are written against Postgres, and a developer who just cloned the
 * repository wants a working database, not a migration history.
 *
 * Called by `npm run db:setup` (laptop), by the Vercel build and by the
 * container's entrypoint (server) — so nobody ever has to remember to migrate.
 */

import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { providerFor } from './prisma-schema.mjs';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const url = process.env.DATABASE_URL?.trim() ?? '';
const provider = providerFor(url);

const run = (args) => {
  const result = spawnSync('npx', ['prisma', ...args], {
    cwd: appDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

if (provider === 'postgresql') {
  console.log('[dvfly] aplicando migrations no Postgres…');
  run(['migrate', 'deploy']);
} else {
  console.log('[dvfly] sincronizando o banco local (SQLite)…');
  run(['db', 'push', '--skip-generate']);
}
