/**
 * Writes `prisma/schema.prisma` (`npm run db:schema`).
 *
 * The thinking lives in `prisma-schema.mjs`; this file only runs it. They are
 * separate on purpose: the previous version was one file that decided "am I
 * being run, or imported?" by comparing `import.meta.url` with
 * `file://${process.argv[1]}` — which is true on Linux and FALSE ON WINDOWS,
 * where the argument is `C:\dvfly\...` and the url is `file:///C:/dvfly/...`.
 * The script then did nothing, said nothing, and exited 0; the next command in
 * the chain failed with "Could not find Prisma Schema" and named a file nobody
 * had been told was generated. A file that exists to be run cannot be a file
 * that guesses whether it is being run.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderSchema } from './prisma-schema.mjs';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(appDir, 'prisma', 'schema.prisma');

/** `.env` is the developer's file; the environment wins over it, as on a host. */
function envDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const file = join(appDir, '.env');
  if (!existsSync(file)) return '';
  const match = /^\s*DATABASE_URL\s*=\s*"?([^"\r\n]*)"?/m.exec(readFileSync(file, 'utf8'));
  return match?.[1]?.trim() ?? '';
}

const { provider, schema } = renderSchema(
  envDatabaseUrl(),
  Boolean(process.env.DATABASE_URL_DIRECT?.trim()),
  process.env.VERCEL === '1',
);

// Rewriting an identical file would touch its mtime and make Prisma and Vite
// redo work for nothing.
if (!existsSync(target) || readFileSync(target, 'utf8') !== schema) {
  writeFileSync(target, schema);
}

// Saying what it wrote is not decoration: when this is silent, the failure
// lands two commands later, somewhere else.
console.log(`[dvfly] banco: ${provider} — prisma/schema.prisma escrito`);
