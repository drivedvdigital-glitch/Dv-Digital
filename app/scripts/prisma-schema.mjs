/**
 * Writes `prisma/schema.prisma` from `prisma/schema.template.prisma`.
 *
 * The models are the same everywhere; the datasource is not. A laptop runs on
 * a SQLite file, because asking someone to install a database server before
 * they can open the app is the step that never gets done. A host runs on
 * Postgres, because a hosted app has no filesystem worth trusting: on Vercel
 * every deployment starts from a fresh disk, and on a VM a file database stops
 * the day a second container starts.
 *
 * The provider is read from DATABASE_URL, so there is nothing to remember and
 * nothing to switch by hand:
 *
 *   file:./dev.db                  → sqlite
 *   postgres://… | postgresql://…  → postgresql
 *
 * DATABASE_URL_DIRECT, when present, becomes Prisma's `directUrl`: a pooled
 * Postgres connection (Neon, Supabase, pgbouncer) cannot run migrations, and
 * this is the unpooled address those providers hand out beside it.
 *
 * The generated file is NOT in git. One source of truth, no drift, and no
 * chance of a machine committing its own datasource.
 *
 * This module only DECIDES; `db-schema.mjs` is what writes. Nothing here has a
 * side effect on import.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const template = join(appDir, 'prisma', 'schema.template.prisma');
const target = join(appDir, 'prisma', 'schema.prisma');

export function providerFor(url) {
  if (/^postgres(ql)?:\/\//i.test(url)) return 'postgresql';
  if (/^file:/i.test(url) || url === '') return 'sqlite';
  throw new Error(
    `DATABASE_URL="${url}" não é um endereço que o D&VFly saiba usar. ` +
      'Use "file:./dev.db" (local) ou "postgresql://usuário:senha@servidor:5432/banco" (servidor).',
  );
}

/**
 * The client generator.
 *
 * `binaryTargets` is the environment-specific part: Prisma ships a query engine
 * compiled for one platform, and a build made here must carry the engine of the
 * machine that will RUN it. On Vercel that machine is not this one, so the
 * extra target goes in; on a VM (or a laptop) the image is built and run on the
 * same platform, and shipping the extra engine is ~50 MB of dead weight in
 * every deployment.
 */
export function generatorBlock(forVercel) {
  const targets = forVercel ? '["native", "rhel-openssl-3.0.x"]' : '["native"]';
  return [
    'generator client {',
    '  provider = "prisma-client-js"',
    `  binaryTargets = ${targets}`,
    '}',
  ].join('\n');
}

export function datasourceBlock(provider, hasDirectUrl) {
  const lines = [
    'datasource db {',
    `  provider = "${provider}"`,
    '  url      = env("DATABASE_URL")',
  ];
  // Referencing an absent variable is a Prisma error, so the line only exists
  // when the variable does.
  if (provider === 'postgresql' && hasDirectUrl) {
    lines.push('  directUrl = env("DATABASE_URL_DIRECT")');
  }
  lines.push('}');
  return lines.join('\n');
}

export function renderSchema(url, hasDirectUrl, forVercel = false) {
  const provider = providerFor(url);
  const source = readFileSync(template, 'utf8');
  for (const marker of ['// <<GENERATOR>>', '// <<DATASOURCE>>']) {
    if (!source.includes(marker)) {
      throw new Error(`schema.template.prisma perdeu o marcador ${marker}.`);
    }
  }
  return {
    provider,
    schema: source
      .replace('// <<GENERATOR>>', generatorBlock(forVercel))
      .replace('// <<DATASOURCE>>', datasourceBlock(provider, hasDirectUrl)),
  };
}

/** `.env` is the developer's file; the environment wins over it, as on a host. */
export function databaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const file = join(appDir, '.env');
  if (!existsSync(file)) return '';
  const match = /^\s*DATABASE_URL\s*=\s*"?([^"\r\n]*)"?/m.exec(readFileSync(file, 'utf8'));
  return match?.[1]?.trim() ?? '';
}

/**
 * Writes `prisma/schema.prisma` for the database currently configured.
 *
 * Every command that touches Prisma calls this first, because the schema on
 * disk carries the PROVIDER: pointing DATABASE_URL at Postgres while the file
 * still says `sqlite` fails with "the URL must start with the protocol file:",
 * which names neither the real problem nor the file to fix.
 */
export function writeSchema() {
  const { provider, schema } = renderSchema(
    databaseUrl(),
    Boolean(process.env.DATABASE_URL_DIRECT?.trim()),
    process.env.VERCEL === '1',
  );
  // Rewriting an identical file would touch its mtime and make Prisma and Vite
  // redo work for nothing.
  if (!existsSync(target) || readFileSync(target, 'utf8') !== schema) {
    writeFileSync(target, schema);
  }
  return { provider, path: target };
}
