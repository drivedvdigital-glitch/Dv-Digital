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

/** The templateSuffix a chrome-less page gets. */
export const SOLO_SUFFIX = 'dvfly-solo';

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
    {
      themeId,
      files: [
        { filename: LAYOUT_FILE, body: { type: 'TEXT', value: LAYOUT } },
        { filename: SECTION_FILE, body: { type: 'TEXT', value: SECTION } },
        { filename: TEMPLATE_FILE, body: { type: 'TEXT', value: TEMPLATE } },
      ],
    },
  );

  const { upsertedThemeFiles, userErrors } = data.themeFilesUpsert;
  if (!upsertedThemeFiles || upsertedThemeFiles.length !== 3) {
    throw new ShopifyError(
      `Não foi possível gravar o modelo D&VFly no tema de ${client.domain}: ` +
        JSON.stringify(userErrors),
      { userErrors },
    );
  }
}
