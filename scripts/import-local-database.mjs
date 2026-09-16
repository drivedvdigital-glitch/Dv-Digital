/**
 * Copies the local SQLite database into the server's Postgres
 * (`npm run migrar-dados`).
 *
 * Going online is not only about the app: the pages already built on the
 * laptop are the work, and they live in `app/prisma/dev.db`. Without this,
 * "hospedar" means starting from an empty screen.
 *
 * Reading the SQLite file directly (Node's own `node:sqlite`) avoids a
 * chicken-and-egg problem: the generated Prisma client speaks one provider at
 * a time, and at this point it is already generated for Postgres.
 *
 * Two properties that matter more than speed here:
 *
 *   - Idempotent. A row whose id is already there is skipped, not duplicated,
 *     so running it twice (or after a failure) is safe.
 *   - Secrets are re-sealed with the SERVER's key on the way in
 *     (secrets.server.ts), because the laptop's database keeps them in the
 *     clear and the server's must not.
 *
 * Usage (from the repository root):
 *
 *   DATABASE_URL="postgresql://…" DVFLY_TOKEN_KEY="…" npm run migrar-dados
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = resolve(process.argv[2] ?? join(root, 'app', 'prisma', 'dev.db'));

const target = process.env.DATABASE_URL?.trim() ?? '';
if (!/^postgres(ql)?:\/\//i.test(target)) {
  console.error(
    'DATABASE_URL precisa apontar para o Postgres do servidor.\n' +
      'Exemplo: DATABASE_URL="postgresql://usuario:senha@servidor:5432/dvfly" npm run migrar-dados',
  );
  process.exit(1);
}
if (!existsSync(source)) {
  console.error(`Não achei o banco local em ${source}.`);
  process.exit(1);
}

const { PrismaClient } = await import('@prisma/client');
const { seal, open } = await import('../app/app/lib/secrets.server.ts');

const sqlite = new DatabaseSync(source, { readOnly: true });
const db = new PrismaClient();

/** Rows of a table, as plain objects. */
const rows = (table) => sqlite.prepare(`SELECT * FROM "${table}"`).all();

/** SQLite keeps DateTime as epoch milliseconds and Boolean as 0/1. */
const date = (value) => (value === null || value === undefined ? null : new Date(Number(value)));
const bool = (value) => Boolean(value);

/** Copies rows whose id is not already on the server. */
async function copy(label, table, model, shape) {
  const all = rows(table);
  let written = 0;
  for (const row of all) {
    const exists = await model.findUnique({ where: { id: row.id }, select: { id: true } });
    if (exists) continue;
    await model.create({ data: shape(row) });
    written++;
  }
  console.log(`  ${label}: ${written} copiada(s), ${all.length - written} já estava(m) lá`);
  return written;
}

console.log(`\n== Levando ${source} para o servidor\n`);

// Order follows the foreign keys: a deployment cannot exist before its page.
await copy('lojas', 'Store', db.store, (row) => ({
  id: row.id,
  domain: row.domain,
  label: row.label,
  clientId: row.clientId,
  // The laptop stores these in the clear; the server never will.
  clientSecret: seal(open(row.clientSecret)),
  accessToken: seal(open(row.accessToken)),
  tokenExpiresAt: date(row.tokenExpiresAt),
  scopes: row.scopes,
  installedAt: date(row.installedAt),
  uninstalledAt: date(row.uninstalledAt),
  isProduction: bool(row.isProduction),
  createdAt: date(row.createdAt) ?? new Date(),
}));

await copy('páginas', 'Page', db.page, (row) => ({
  id: row.id,
  title: row.title,
  handle: row.handle,
  doc: row.doc,
  pageType: row.pageType,
  showChrome: bool(row.showChrome),
  productContentAbove: bool(row.productContentAbove),
  createdAt: date(row.createdAt) ?? new Date(),
  updatedAt: date(row.updatedAt) ?? new Date(),
}));

await copy('versões', 'Version', db.version, (row) => ({
  id: row.id,
  pageId: row.pageId,
  doc: row.doc,
  compilerVersion: row.compilerVersion,
  label: row.label,
  createdAt: date(row.createdAt) ?? new Date(),
}));

await copy('publicações', 'Deployment', db.deployment, (row) => ({
  id: row.id,
  pageId: row.pageId,
  versionId: row.versionId,
  storeId: row.storeId,
  shopifyGid: row.shopifyGid,
  isPublished: bool(row.isPublished),
  bytes: Number(row.bytes),
  publishedAt: date(row.publishedAt) ?? new Date(),
}));

await copy('produtos vinculados', 'ProductLink', db.productLink, (row) => ({
  id: row.id,
  pageId: row.pageId,
  storeId: row.storeId,
  productGid: row.productGid,
  productHandle: row.productHandle,
  productTitle: row.productTitle,
  createdAt: date(row.createdAt) ?? new Date(),
}));

console.log('\n== Pronto. O banco local continua intacto: nada foi apagado daqui.\n');

sqlite.close();
await db.$disconnect();
