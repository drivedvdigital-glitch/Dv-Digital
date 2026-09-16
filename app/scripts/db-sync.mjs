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
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeSchema } from './prisma-schema.mjs';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
// The schema carries the provider, so it is written HERE, from the database
// actually configured — otherwise `db:deploy` on its own inherits whatever
// provider the last build happened to leave on disk.
const { provider } = writeSchema();

/**
 * The Prisma CLI's own entry file, run by this same Node.
 *
 * Not `npx`: on Windows `npx` is a batch file, which Node refuses to spawn
 * without a shell, and spawning WITH a shell concatenates the arguments into a
 * command line instead of escaping them — Node warns about exactly that
 * (DEP0190) because it is how an argument becomes a command. Asking the
 * installed package where its executable is removes the shell from the picture
 * on every platform.
 */
function prismaEntry() {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve('prisma/package.json');
  const { bin } = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const relative = typeof bin === 'string' ? bin : bin.prisma;
  return join(dirname(manifestPath), relative);
}

const run = (args) => {
  const result = spawnSync(process.execPath, [prismaEntry(), ...args], {
    cwd: appDir,
    stdio: 'inherit',
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
