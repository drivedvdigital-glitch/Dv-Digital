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
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const template = join(appDir, 'prisma', 'schema.template.prisma');
const target = join(appDir, 'prisma', 'schema.prisma');

/** `.env` is the developer's file; the environment wins over it, as on a host. */
function envDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const file = join(appDir, '.env');
  if (!existsSync(file)) return '';
  const match = /^\s*DATABASE_URL\s*=\s*"?([^"\r\n]*)"?/m.exec(readFileSync(file, 'utf8'));
  return match?.[1]?.trim() ?? '';
}

export function providerFor(url) {
  if (/^postgres(ql)?:\/\//i.test(url)) return 'postgresql';
  if (/^file:/i.test(url) || url === '') return 'sqlite';
  throw new Error(
    `DATABASE_URL="${url}" não é um endereço que o D&VFly saiba usar. ` +
      'Use "file:./dev.db" (local) ou "postgresql://usuário:senha@servidor:5432/banco" (servidor).',
  );
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

export function renderSchema(url, hasDirectUrl) {
  const provider = providerFor(url);
  const source = readFileSync(template, 'utf8');
  if (!source.includes('// <<DATASOURCE>>')) {
    throw new Error('schema.template.prisma perdeu o marcador // <<DATASOURCE>>.');
  }
  return {
    provider,
    schema: source.replace('// <<DATASOURCE>>', datasourceBlock(provider, hasDirectUrl)),
  };
}

// Only writes when run directly, so the functions above stay testable.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const url = envDatabaseUrl();
  const { provider, schema } = renderSchema(url, Boolean(process.env.DATABASE_URL_DIRECT?.trim()));
  // Rewriting an identical file would touch its mtime and make Prisma and
  // Vite redo work for nothing.
  if (!existsSync(target) || readFileSync(target, 'utf8') !== schema) {
    writeFileSync(target, schema);
  }
  console.log(`[dvfly] banco: ${provider}`);
}
