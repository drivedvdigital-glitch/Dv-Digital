/**
 * An in-memory store with several themes, enforcing what Shopify enforces on
 * theme files — so a write order that only worked because the theme already
 * had the file fails here as it would on a fresh theme:
 *
 *   - a template's `layout` must already exist in the theme (not arrive in
 *     the same call);
 *   - a template's section types must exist (before or in the same call);
 *   - at most 50 files per call.
 *
 * Products and pages carry `templateSuffix`, paginated like the Admin API.
 */

import type { ShopifyClient } from '../src/client.ts';

export interface FakeTheme {
  id: string;
  name: string;
  role: 'MAIN' | 'UNPUBLISHED';
  files: Record<string, string>;
  processing?: boolean;
}

export function fakeThemesStore(options: {
  themes: FakeTheme[];
  products?: Array<{ title: string; templateSuffix: string | null }>;
  pages?: Array<{ title: string; templateSuffix: string | null }>;
  pageSize?: number;
}) {
  const { themes } = options;
  const calls: string[] = [];
  // Shopify's clock for each file: seeded files are old, every write is newer.
  let clock = 2_000_000_000_000;
  const stamps = new Map<string, number>();
  const stampOf = (themeId: string, filename: string) => stamps.get(`${themeId}|${filename}`) ?? 1_900_000_000_000;
  const touch = (themeId: string, filename: string, content?: string) => {
    if (content !== undefined) theme(themeId).files[filename] = content;
    stamps.set(`${themeId}|${filename}`, (clock += 1000));
  };
  const pageSize = options.pageSize ?? 250;
  const theme = (id: string) => {
    const found = themes.find((t) => t.id === id);
    if (!found) throw new Error(`no theme ${id}`);
    return found;
  };
  const parse = (text: string): Record<string, unknown> | null => {
    try {
      return JSON.parse(text.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ''));
    } catch {
      return null;
    }
  };
  const list = (rows: Array<{ title: string; templateSuffix: string | null }>, after: string | null) => {
    const start = after ? Number(after) : 0;
    const nodes = rows.slice(start, start + pageSize);
    const next = start + pageSize < rows.length ? String(start + pageSize) : null;
    return { nodes, pageInfo: { hasNextPage: next !== null, endCursor: next } };
  };

  const client = {
    domain: 'loja.myshopify.com',
    async graphql(query: string, variables: Record<string, unknown> = {}) {
      const name = query.match(/(?:query|mutation)\s+(\w+)/)?.[1] ?? (/roles: \[MAIN\]/.test(query) ? 'mainTheme' : 'anonymous');
      calls.push(name);
      if (/roles: \[MAIN\]/.test(query)) return { themes: { nodes: themes.filter((t) => t.role === 'MAIN').map((t) => ({ id: t.id })) } };
      if (/themes\(first: 50\)/.test(query)) {
        return {
          themes: {
            nodes: themes.map((t) => ({
              id: t.id,
              name: t.name,
              role: t.role,
              processing: t.processing ?? false,
              processingFailed: false,
              updatedAt: '2026-10-20T00:00:00Z',
            })),
          },
        };
      }
      if (/themeFilesUpsert/.test(query)) {
        const target = theme(variables.themeId as string);
        const files = variables.files as Array<{ filename: string; body: { value: string } }>;
        if (files.length > 50) {
          return { themeFilesUpsert: { upsertedThemeFiles: null, userErrors: [{ field: ['files'], message: 'Too many files (max 50)' }] } };
        }
        const arriving = new Set(files.map((f) => f.filename));
        for (const f of files) {
          if (!/^templates\/.*\.json$/.test(f.filename)) continue;
          const json = parse(f.body.value);
          if (!json) return { themeFilesUpsert: { upsertedThemeFiles: null, userErrors: [{ field: ['files'], message: `${f.filename}: invalid JSON` }] } };
          const layout = json.layout;
          if (typeof layout === 'string' && !(`layout/${layout}.liquid` in target.files)) {
            return {
              themeFilesUpsert: {
                upsertedThemeFiles: null,
                userErrors: [{ field: ['files'], message: `${f.filename}: Layout '${layout}' does not exist` }],
              },
            };
          }
          for (const s of Object.values((json.sections ?? {}) as Record<string, { type?: string }>)) {
            const type = String(s?.type ?? '');
            if (!type || type.startsWith('shopify://')) continue;
            const sectionFile = `sections/${type}.liquid`;
            if (!(sectionFile in target.files) && !arriving.has(sectionFile)) {
              return {
                themeFilesUpsert: {
                  upsertedThemeFiles: null,
                  userErrors: [{ field: ['files'], message: `${f.filename}: Section type '${type}' does not refer to an existing section file` }],
                },
              };
            }
          }
        }
        for (const f of files) touch(target.id, f.filename, f.body.value);
        return { themeFilesUpsert: { upsertedThemeFiles: files.map((f) => ({ filename: f.filename })), userErrors: [] } };
      }
      if (/themeFilesDelete/.test(query)) {
        const target = theme(variables.themeId as string);
        for (const f of variables.files as string[]) delete target.files[f];
        return { themeFilesDelete: { deletedThemeFiles: [], userErrors: [] } };
      }
      if (/DvflyThemeFiles/.test(query)) {
        const target = theme(variables.themeId as string);
        const names = variables.filenames as string[];
        if (names.length > 50) throw new Error('more than 50 filenames in one read');
        return {
          theme: {
            files: {
              nodes: names
                .filter((n) => n in target.files)
                .map((n) => ({ filename: n, updatedAt: new Date(stampOf(target.id, n)).toISOString(), body: { content: target.files[n] } })),
            },
          },
        };
      }
      if (/DvflyTemplateUses/.test(query)) {
        const field = /products\(/.test(query) ? 'products' : 'pages';
        const rows = field === 'products' ? (options.products ?? []) : (options.pages ?? []);
        return { [field]: list(rows, (variables.after as string | null) ?? null) };
      }
      throw new Error(`unexpected: ${query.slice(0, 80)}`);
    },
  } as unknown as ShopifyClient;
  /** `touch`: the merchant (or a publish) writing a file now. */
  return { client, calls, theme, touch };
}
