/**
 * Settles the one question the documentation could not: does this store's
 * private app get to write theme files, or does Shopify require an exemption?
 *
 * See docs/PESQUISA_PAGEFLY.md, appendix A.4. Shopify's own docs contradict
 * each other on this, and the answer decides whether the product/collection/
 * home publishing track is viable or whether we fall back to app blocks plus
 * deep linking.
 *
 * Safety rules this script follows, because it runs against a real store:
 *   - It never touches the live theme. If no unpublished theme exists, the
 *     theme probe is skipped rather than run somewhere dangerous.
 *   - The page it creates is a draft, never published.
 *   - Everything it creates, it deletes before exiting.
 *
 * Usage:
 *   SHOP=my-store.myshopify.com ADMIN_TOKEN=shpat_... \
 *     node --experimental-strip-types bin/shopify-probe.ts
 */

const SHOP = process.env.SHOP;
const TOKEN = process.env.ADMIN_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION ?? '2026-07';

if (!SHOP || !TOKEN) {
  console.error(
    'Faltam variáveis de ambiente.\n\n' +
      '  SHOP=sua-loja.myshopify.com\n' +
      '  ADMIN_TOKEN=shpat_...   (token do app criado em Configurações → Apps → Desenvolver apps)\n\n' +
      'Scopes necessários no app: write_content, read_themes, write_themes, write_products\n',
  );
  process.exit(1);
}

const ENDPOINT = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;
const MARKER = `dvfly-probe-${Date.now()}`;

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}

async function gql<T>(query: string, variables: Record<string, unknown> = {}) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN!,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText}\n${body.slice(0, 500)}`);
  }
  return (await response.json()) as GraphQLResponse<T>;
}

/** Renders a userErrors array, whatever shape the particular mutation uses. */
function describeErrors(errors: unknown): string {
  if (!Array.isArray(errors) || errors.length === 0) return '';
  return errors
    .map((e: Record<string, unknown>) => `${e.code ?? e.field ?? 'erro'}: ${e.message}`)
    .join('; ');
}

const results: Array<{ name: string; ok: boolean; detail: string }> = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}\n      ${detail}`);
}

// ---------------------------------------------------------------------------
// Probe 1 — can we read the shop at all? Validates the token and the version.
// ---------------------------------------------------------------------------
async function probeConnection() {
  const res = await gql<{ shop: { name: string; myshopifyDomain: string } }>(
    `{ shop { name myshopifyDomain } }`,
  );
  if (res.errors) {
    record('Conexão e token', false, describeErrors(res.errors) || JSON.stringify(res.errors));
    return false;
  }
  record('Conexão e token', true, `loja "${res.data!.shop.name}", API ${API_VERSION}`);
  return true;
}

// ---------------------------------------------------------------------------
// Probe 2 — pageCreate / pageDelete. This is the whole MVP path.
// ---------------------------------------------------------------------------
async function probePages() {
  const created = await gql<{
    pageCreate: { page: { id: string; handle: string } | null; userErrors: unknown[] };
  }>(
    `mutation Probe($page: PageCreateInput!) {
       pageCreate(page: $page) {
         page { id handle }
         userErrors { code field message }
       }
     }`,
    {
      page: {
        title: `D&VFly probe ${MARKER}`,
        handle: MARKER,
        body: '<p>Página temporária de teste. Pode ser apagada.</p>',
        isPublished: false,
      },
    },
  );

  if (created.errors) {
    record('pageCreate', false, describeErrors(created.errors));
    return;
  }
  const payload = created.data!.pageCreate;
  if (!payload.page) {
    record('pageCreate', false, describeErrors(payload.userErrors) || 'sem página no retorno');
    return;
  }
  record('pageCreate', true, `criou ${payload.page.id} (rascunho, não publicada)`);

  const deleted = await gql<{ pageDelete: { deletedPageId: string | null; userErrors: unknown[] } }>(
    `mutation Cleanup($id: ID!) {
       pageDelete(id: $id) { deletedPageId userErrors { code field message } }
     }`,
    { id: payload.page.id },
  );
  const ok = Boolean(deleted.data?.pageDelete?.deletedPageId);
  record('pageDelete (limpeza)', ok, ok ? 'página de teste removida' : 'FALHOU — apague à mão');
}

// ---------------------------------------------------------------------------
// Probe 3 — the actual question. themeFilesUpsert on an unpublished theme.
// ---------------------------------------------------------------------------
async function probeThemeFiles() {
  const themes = await gql<{
    themes: { nodes: Array<{ id: string; name: string; role: string }> };
  }>(`{ themes(first: 50) { nodes { id name role } } }`);

  if (themes.errors) {
    record('read_themes', false, describeErrors(themes.errors));
    return;
  }
  const all = themes.data!.themes.nodes;
  record('read_themes', true, `${all.length} tema(s) encontrado(s)`);

  // MAIN is the live theme. We do not write to it, full stop.
  const target = all.find((t) => t.role !== 'MAIN');
  if (!target) {
    record(
      'themeFilesUpsert',
      false,
      'PULADO — só existe o tema publicado. Duplique o tema na Shopify e rode de novo; ' +
        'este script não escreve no tema ao vivo.',
    );
    return;
  }

  const filename = `templates/page.${MARKER}.json`;
  const body = JSON.stringify({ sections: {}, order: [] });

  const upsert = await gql<{
    themeFilesUpsert: { upsertedThemeFiles: unknown[] | null; userErrors: unknown[] };
  }>(
    `mutation Probe($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
       themeFilesUpsert(themeId: $themeId, files: $files) {
         upsertedThemeFiles { filename }
         userErrors { code filename message }
       }
     }`,
    { themeId: target.id, files: [{ filename, body: { type: 'TEXT', value: body } }] },
  );

  if (upsert.errors) {
    const detail = describeErrors(upsert.errors);
    const denied = /access denied|not approved|exemption|protected/i.test(detail);
    record(
      'themeFilesUpsert',
      false,
      denied
        ? `NEGADO — ${detail}\n      => Shopify exige isenção. Vamos de app blocks + deep linking (plano B).`
        : detail,
    );
    return;
  }

  const payload = upsert.data!.themeFilesUpsert;
  const wrote = Array.isArray(payload.upsertedThemeFiles) && payload.upsertedThemeFiles.length > 0;
  if (!wrote) {
    record('themeFilesUpsert', false, describeErrors(payload.userErrors) || 'nada foi escrito');
    return;
  }

  record(
    'themeFilesUpsert',
    true,
    `escreveu ${filename} no tema "${target.name}" (${target.role})\n` +
      '      => A trilha de templates está LIBERADA para este app.',
  );

  const cleanup = await gql<{ themeFilesDelete: { deletedThemeFiles: unknown[] | null } }>(
    `mutation Cleanup($themeId: ID!, $files: [String!]!) {
       themeFilesDelete(themeId: $themeId, files: $files) {
         deletedThemeFiles { filename }
         userErrors { code filename message }
       }
     }`,
    { themeId: target.id, files: [filename] },
  );
  const cleaned = Boolean(cleanup.data?.themeFilesDelete?.deletedThemeFiles);
  record(
    'themeFilesDelete (limpeza)',
    cleaned,
    cleaned ? 'arquivo de teste removido' : `FALHOU — apague ${filename} à mão`,
  );
}

// ---------------------------------------------------------------------------

console.log(`\nD&VFly — sondagem de permissões em ${SHOP}\n`);

const connected = await probeConnection();
if (connected) {
  await probePages();
  await probeThemeFiles();
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} verificações passaram.\n` +
    (failed.length === 0
      ? 'Trilha de templates liberada — a arquitetura pode seguir pelo caminho principal.\n'
      : 'Veja acima o que falhou. Se foi só o themeFilesUpsert, o plano B (app blocks +\n' +
        'deep linking) está documentado no Apêndice A.3 da pesquisa.\n'),
);
