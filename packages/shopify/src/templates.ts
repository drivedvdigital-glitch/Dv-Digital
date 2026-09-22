/**
 * Theme templates owned by D&VFly.
 *
 * "Mostrar cabeçalho e rodapé" is not a CSS trick: the theme's header and
 * footer live in its layout, so the only honest way to remove them is to bind
 * the page to a different layout. Publishing writes three small files into the
 * store's MAIN theme — a minimal layout, a section that renders the page body,
 * and a page template pointing at both — and then points the page at that
 * template via `templateSuffix`.
 *
 * Everything here is idempotent: the files are upserted with fixed names and
 * identical content on every publish, so re-publishing changes nothing. The
 * layout keeps `content_for_header` — Shopify's own scripts (analytics,
 * consent, payments) must survive losing the theme chrome.
 *
 * Proven live on 15/09/2026: a page bound to `page.dvfly-solo` renders on the
 * storefront with no theme header/footer and with Shopify's head intact.
 */

import { ShopifyError, type ShopifyClient } from './client.ts';
import { SOLO_SUFFIX } from './constants.ts';

export { SOLO_SUFFIX };

const LAYOUT_FILE = 'layout/theme.dvfly.liquid';
const SECTION_FILE = 'sections/dvfly-page.liquid';
const TEMPLATE_FILE = `templates/page.${SOLO_SUFFIX}.json`;

const LAYOUT = `<!doctype html>
<html lang="{{ request.locale.iso_code }}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="canonical" href="{{ canonical_url }}">
  <title>{{ page_title }}</title>
  {{ content_for_header }}
</head>
<body style="margin:0">
  {{ content_for_layout }}
</body>
</html>
`;

const SECTION = `{{ page.content }}
{% schema %}
{ "name": "Pagina DVFly", "settings": [] }
{% endschema %}
`;

const TEMPLATE = JSON.stringify(
  {
    layout: 'theme.dvfly',
    sections: { main: { type: 'dvfly-page' } },
    order: ['main'],
  },
  null,
  2,
);

// ---- product pages: one template per page ---------------------------------

/** The templateSuffix a product page gets, derived from the page id. */
export const productSuffix = (pageId: string) => `dvfly-${pageId.toLowerCase()}`;
/** The section (file stem) that carries the page's compiled content. */
export const productSectionType = (pageId: string) => `dvfly-p-${pageId.toLowerCase()}`;

const productTemplateFile = (pageId: string) => `templates/product.${productSuffix(pageId)}.json`;
const productSectionFile = (pageId: string) => `sections/${productSectionType(pageId)}.liquid`;

/**
 * Theme JSON is not strict JSON: the editor prepends a `/* … *\/` notice and,
 * since API 2024-10, Shopify tolerates trailing commas. JSON.parse accepts
 * neither, so both are removed before parsing.
 */
export function stripJsonComments(text: string): string {
  const body = text.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '');
  // Trailing commas go, but only outside strings: a merchant's heading may
  // legitimately read "Related, ]" and must come back untouched.
  let out = '';
  let inString = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      out += ch;
      if (ch === '\\') out += body[++i] ?? '';
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === ',') {
      let j = i + 1;
      while (j < body.length && /\s/.test(body[j])) j++;
      if (body[j] === '}' || body[j] === ']') continue;
    }
    out += ch;
  }
  return out;
}

/** Reads theme files as text, in the order asked; null where the theme lacks one. */
export async function readThemeFiles(
  client: ShopifyClient,
  themeId: string,
  filenames: string[],
): Promise<Array<string | null>> {
  const data = await client.graphql<{
    theme: {
      files: { nodes: Array<{ filename: string; body: { content?: string } }> };
    } | null;
  }>(
    `query DvflyThemeFiles($themeId: ID!, $filenames: [String!]!, $first: Int!) {
       theme(id: $themeId) {
         files(filenames: $filenames, first: $first) {
           nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
         }
       }
     }`,
    { themeId, filenames, first: filenames.length },
  );
  const nodes = data.theme?.files.nodes ?? [];
  return filenames.map((filename) => nodes.find((f) => f.filename === filename)?.body.content ?? null);
}

/** Reads one theme file as text, or null when the theme does not have it. */
export async function readThemeFile(
  client: ShopifyClient,
  themeId: string,
  filename: string,
): Promise<string | null> {
  return (await readThemeFiles(client, themeId, [filename]))[0];
}

export interface ProductTemplateInput {
  pageId: string;
  /** Shown in the theme editor as the section's name. */
  title: string;
  /** The compiled fragment: <style> + markup + optional <script>. */
  fragment: string;
  /** Our content above the theme's product sections instead of below. */
  contentAbove?: boolean;
  /**
   * Theme header and footer around the page (default true). False binds the
   * template to a layout derived from the theme's own, minus the header and
   * footer section groups — so THIS page loses them and the rest of the
   * store keeps them. Hiding them in the theme editor would hide them on
   * every page, which is the trap this setting exists to avoid.
   */
  chrome?: boolean;
  /**
   * Bare: our section alone, on the minimal D&VFly layout — no theme product
   * sections, none of the theme's CSS or JS. Measured on the first live
   * landing page (21/09): the theme layout brought 9 requests and ~21 KB gz
   * (global.js, base.css, animations, search, modal…) plus ~10 KB of inline
   * CSS from `theme.liquid`, for a page that used none of it. Shopify's own
   * head (`content_for_header`) and app embeds such as the COD form stay:
   * the layout keeps that tag.
   */
  bare?: boolean;
}

/** The minimal layout's name as a template refers to it (`layout/theme.dvfly.liquid`). */
export const SOLO_LAYOUT = 'theme.dvfly';

/** The layout a chrome-less product page binds to (`layout/theme.dvfly-product.liquid`). */
export const PRODUCT_LAYOUT = 'theme.dvfly-product';
const PRODUCT_LAYOUT_FILE = `layout/${PRODUCT_LAYOUT}.liquid`;

/** The tags OS 2.0 (and older) themes use to place header, footer and announcement bar. */
const CHROME_TAGS = /\{%-?\s*sections?\s+['"](?:header-group|footer-group|header|footer|announcement-bar)['"]\s*-?%\}/g;

/**
 * The theme's own `layout/theme.liquid` with the header and footer taken
 * out — and nothing else touched, so the theme's stylesheets, scripts and
 * the product sections keep working exactly as designed. A theme whose
 * layout does not use the standard tags falls back to the minimal D&VFly
 * layout (the one regular chrome-less pages use).
 */
export function chromelessLayout(themeLiquid: string | null): string {
  if (!themeLiquid) return LAYOUT;
  let removed = 0;
  const stripped = themeLiquid.replace(CHROME_TAGS, () => {
    removed++;
    return '{%- comment -%} D&VFly: cabecalho/rodape do tema nao entram neste modelo {%- endcomment -%}';
  });
  if (removed === 0) return LAYOUT;
  return `{%- comment -%} Generated by D&VFly from layout/theme.liquid: the theme's layout without header and footer. Rewritten on every publish; edit the theme's layout, not this file. {%- endcomment -%}\n${stripped}`;
}

/**
 * Renders the section file: the compiled page verbatim, plus the schema the
 * theme editor needs. `{% raw %}` keeps the author's HTML out of Liquid's
 * hands — a `{{` in pasted markup must reach the browser as text.
 */
export function productSectionLiquid(input: ProductTemplateInput): string {
  if (/\{%-?\s*endraw\s*-?%\}/i.test(input.fragment)) {
    throw new ShopifyError(
      'O conteúdo da página contém "{% endraw %}", que a Shopify não permite dentro de uma seção.',
    );
  }
  // Section names are capped at 25 characters by the theme editor. Counted
  // in code points, so an emoji at the cut is dropped whole, never halved.
  const title = input.title.trim();
  const name = Array.from(title ? `D&VFly · ${title}` : 'D&VFly').slice(0, 25).join('').trimEnd();
  // No presets: the section cannot be added elsewhere from the editor's
  // "Add section" nor removed there (hiding it stays possible). Product
  // templates only, once — it carries one page's content.
  const schema = { name, settings: [], enabled_on: { templates: ['product'] }, limit: 1 };
  return [
    `{%- comment -%} Generated by D&VFly for page ${input.pageId}. Edit the page in D&VFly, not here. {%- endcomment -%}`,
    '{% raw %}',
    input.fragment,
    '{% endraw %}',
    '{% schema %}',
    JSON.stringify(schema),
    '{% endschema %}',
    '',
  ].join('\n');
}

type TemplateJson = { sections?: Record<string, unknown>; order?: string[]; [key: string]: unknown };

/** The id our section has inside the template. */
const OUR_SECTION = 'dvfly';

function parseTemplate(text: string, what: string): TemplateJson {
  try {
    const parsed = JSON.parse(stripJsonComments(text));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed as TemplateJson;
  } catch {
    throw new ShopifyError(`O ${what} do tema não pôde ser lido como JSON.`);
  }
}

/**
 * Composes our template. The first publish starts from the theme's own
 * `templates/product.json`: every section the theme renders on a product page
 * stays (price, variants, buy) and ours is added below them — or above, when
 * asked. From then on the base is the template AS THE MERCHANT LEFT IT in the
 * theme editor (`existingJson`): reordered, sections hidden or tweaked —
 * republishing only guarantees that our section is there. Our section moves
 * between the ends when the "above/below" setting changes; a custom position
 * in the middle is the merchant's and is kept.
 */
export function composeProductTemplate(
  themeProductJson: string | null,
  input: ProductTemplateInput,
  existingJson?: string | null,
): string {
  // Bare: nothing of the theme's template survives — not its sections, not
  // its layout. Turning bare off later starts again from the theme's own
  // product.json, because a bare template has no theme sections to keep.
  if (input.bare) {
    return JSON.stringify(
      {
        layout: SOLO_LAYOUT,
        sections: { [OUR_SECTION]: { type: productSectionType(input.pageId), settings: {} } },
        order: [OUR_SECTION],
      },
      null,
      2,
    );
  }
  let base: TemplateJson | null = null;
  let fromExisting = false;
  if (existingJson) {
    try {
      const candidate = parseTemplate(existingJson, productTemplateFile(input.pageId));
      const theirs = (candidate.order ?? []).filter((id) => id !== OUR_SECTION && id in (candidate.sections ?? {}));
      if (theirs.length > 0) {
        base = candidate;
        fromExisting = true;
      }
    } catch {
      // An unreadable copy of our own file is rebuilt from the theme's default.
    }
  }
  if (!base) base = themeProductJson ? parseTemplate(themeProductJson, 'templates/product.json') : {};

  const sections = { ...(base.sections ?? {}) };
  // A theme section that happens to use our id would be replaced; filtering
  // it here keeps the order free of duplicates either way.
  const theirs = [...(base.order ?? [])].filter((id) => id in sections && id !== OUR_SECTION);
  if (theirs.length === 0) {
    throw new ShopifyError(
      'O tema não tem um templates/product.json com seções — não dá para compor o modelo de produto.',
    );
  }
  sections[OUR_SECTION] = { type: productSectionType(input.pageId), settings: {} };

  const currentIndex = (base.order ?? []).indexOf(OUR_SECTION);
  const inTheMiddle = fromExisting && currentIndex > 0 && currentIndex < (base.order?.length ?? 0) - 1;
  const order = inTheMiddle
    ? (base.order ?? []).filter((id) => id in sections)
    : input.contentAbove
      ? [OUR_SECTION, ...theirs]
      : [...theirs, OUR_SECTION];

  // Chrome off binds our layout; chrome on removes OUR layout only — a
  // layout the theme itself declared is the theme's business.
  const { layout: baseLayout, ...rest } = base;
  const layout =
    input.chrome === false ? PRODUCT_LAYOUT : baseLayout === PRODUCT_LAYOUT ? undefined : baseLayout;

  return JSON.stringify({ ...rest, ...(layout ? { layout } : {}), sections, order }, null, 2);
}

/**
 * Writes (or rewrites) the page's product template and section into the main
 * theme. Idempotent by content. Returns the suffix products must be pointed at.
 */
export async function ensureProductTemplate(
  client: ShopifyClient,
  input: ProductTemplateInput,
): Promise<{ suffix: string; files: string[] }> {
  const themeId = await mainThemeId(client);
  const [themeProduct, existing, themeLayout] = await readThemeFiles(client, themeId, [
    'templates/product.json',
    productTemplateFile(input.pageId),
    'layout/theme.liquid',
  ]);
  const files = [
    { filename: productSectionFile(input.pageId), body: { type: 'TEXT', value: productSectionLiquid(input) } },
    {
      filename: productTemplateFile(input.pageId),
      body: { type: 'TEXT', value: composeProductTemplate(themeProduct, input, existing) },
    },
  ];
  // The chrome-less layout is rebuilt from the theme's current layout on
  // every publish that needs it, so a theme update reaches it too. It goes
  // in FIRST, on its own: Shopify validates a template's `layout` against
  // the files the theme already has, so a layout arriving in the same batch
  // as the template that names it is not there yet.
  if (input.bare) {
    // The minimal layout, same file regular chrome-less pages use.
    await upsertThemeFiles(client, themeId, [{ filename: LAYOUT_FILE, body: { type: 'TEXT', value: LAYOUT } }]);
  } else if (input.chrome === false) {
    await upsertThemeFiles(client, themeId, [
      { filename: PRODUCT_LAYOUT_FILE, body: { type: 'TEXT', value: chromelessLayout(themeLayout) } },
    ]);
  }
  await upsertThemeFiles(client, themeId, files);
  return { suffix: productSuffix(input.pageId), files: files.map((f) => f.filename) };
}

/** Removes the page's template and section from the main theme. */
export async function removeProductTemplate(client: ShopifyClient, pageId: string): Promise<void> {
  const themeId = await mainThemeId(client);
  const data = await client.graphql<{
    themeFilesDelete: {
      deletedThemeFiles: Array<{ filename: string }> | null;
      userErrors: Array<{ code?: string | null; message?: string }>;
    };
  }>(
    `mutation DvflyThemeFilesDelete($themeId: ID!, $files: [String!]!) {
       themeFilesDelete(themeId: $themeId, files: $files) {
         deletedThemeFiles { filename }
         userErrors { code field message }
       }
     }`,
    { themeId, files: [productTemplateFile(pageId), productSectionFile(pageId)] },
  );
  // A file that is already gone is not a failure — by code, or by wording
  // when the code is missing.
  const errors = data.themeFilesDelete.userErrors.filter(
    (e) => e.code !== 'NOT_FOUND' && !/not found|does not exist/i.test(e.message ?? ''),
  );
  if (errors.length > 0) {
    throw new ShopifyError(
      `Não foi possível remover o modelo de produto do tema de ${client.domain}: ${JSON.stringify(errors)}`,
      { userErrors: errors },
    );
  }
}

async function upsertThemeFiles(
  client: ShopifyClient,
  themeId: string,
  files: Array<{ filename: string; body: { type: string; value: string } }>,
): Promise<void> {
  const data = await client.graphql<{
    themeFilesUpsert: {
      upsertedThemeFiles: Array<{ filename: string }> | null;
      userErrors: unknown[];
    };
  }>(
    `mutation DvflyThemeFiles($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
       themeFilesUpsert(themeId: $themeId, files: $files) {
         upsertedThemeFiles { filename }
         userErrors { field message }
       }
     }`,
    { themeId, files },
  );
  const { upsertedThemeFiles, userErrors } = data.themeFilesUpsert;
  if (!upsertedThemeFiles || upsertedThemeFiles.length !== files.length) {
    throw new ShopifyError(
      `Não foi possível gravar arquivos no tema de ${client.domain}: ${JSON.stringify(userErrors)}`,
      { userErrors },
    );
  }
}

/** The store's MAIN theme — the one visitors see. */
export async function mainThemeId(client: ShopifyClient): Promise<string> {
  const data = await client.graphql<{ themes: { nodes: Array<{ id: string }> } }>(
    `{ themes(first: 1, roles: [MAIN]) { nodes { id } } }`,
  );
  const theme = data.themes.nodes[0];
  if (!theme) {
    throw new ShopifyError(`A loja ${client.domain} não tem tema principal publicado.`);
  }
  return theme.id;
}

/**
 * Writes (or rewrites) the chrome-less page template into the main theme.
 * Safe to call on every publish.
 */
export async function ensureSoloTemplate(client: ShopifyClient): Promise<void> {
  const themeId = await mainThemeId(client);
  await upsertThemeFiles(client, themeId, [
    { filename: LAYOUT_FILE, body: { type: 'TEXT', value: LAYOUT } },
    { filename: SECTION_FILE, body: { type: 'TEXT', value: SECTION } },
    { filename: TEMPLATE_FILE, body: { type: 'TEXT', value: TEMPLATE } },
  ]);
}
