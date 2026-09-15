/**
 * Online store pages — the MVP publishing track (docs/ARQUITETURA.md, A.1).
 *
 * Three mutations and no separate publish call: publishing is the `isPublished`
 * field, and scheduling is `publishDate`. The `body` field takes HTML, which is
 * what the compiler emits, so a page ends up living inside Shopify rather than
 * only in our database — invariants I4 and I5, for free.
 */

import { formatUserErrors, ShopifyError, type ShopifyClient } from './client.ts';

export interface PageInput {
  title: string;
  /** Compiled fragment: <style> + markup + optional <script>. */
  body: string;
  handle?: string;
  isPublished?: boolean;
  /** ISO 8601. Shopify makes the page visible at this moment. */
  publishDate?: string;
  /** Explicit null clears the suffix, returning the page to the theme default. */
  templateSuffix?: string | null;
}

export interface ShopifyPage {
  id: string;
  title: string;
  handle: string;
  isPublished: boolean;
  publishedAt: string | null;
  updatedAt: string;
  templateSuffix: string | null;
}

const PAGE_FIELDS = `
  id
  title
  handle
  isPublished
  publishedAt
  updatedAt
  templateSuffix
`;

export async function createPage(
  client: ShopifyClient,
  input: PageInput,
): Promise<ShopifyPage> {
  const data = await client.graphql<{
    pageCreate: { page: ShopifyPage | null; userErrors: unknown[] };
  }>(
    `mutation DvflyPageCreate($page: PageCreateInput!) {
       pageCreate(page: $page) {
         page { ${PAGE_FIELDS} }
         userErrors { code field message }
       }
     }`,
    { page: input },
  );

  const { page, userErrors } = data.pageCreate;
  if (!page) {
    throw new ShopifyError(
      `Não foi possível criar a página em ${client.domain}: ${formatUserErrors(userErrors)}`,
      { userErrors },
    );
  }
  return page;
}

export interface PageUpdateInput extends Partial<PageInput> {
  /**
   * When the handle changes, Shopify can redirect the old URL to the new one.
   * Defaults to true here because silently breaking a live link is worse than
   * an extra redirect — the API's own default is false.
   */
  redirectNewHandle?: boolean;
}

export async function updatePage(
  client: ShopifyClient,
  id: string,
  input: PageUpdateInput,
): Promise<ShopifyPage> {
  const data = await client.graphql<{
    pageUpdate: { page: ShopifyPage | null; userErrors: unknown[] };
  }>(
    `mutation DvflyPageUpdate($id: ID!, $page: PageUpdateInput!) {
       pageUpdate(id: $id, page: $page) {
         page { ${PAGE_FIELDS} }
         userErrors { code field message }
       }
     }`,
    { id, page: { redirectNewHandle: true, ...input } },
  );

  const { page, userErrors } = data.pageUpdate;
  if (!page) {
    throw new ShopifyError(
      `Não foi possível atualizar a página ${id} em ${client.domain}: ${formatUserErrors(userErrors)}`,
      { userErrors },
    );
  }
  return page;
}

export async function deletePage(client: ShopifyClient, id: string): Promise<void> {
  const data = await client.graphql<{
    pageDelete: { deletedPageId: string | null; userErrors: unknown[] };
  }>(
    `mutation DvflyPageDelete($id: ID!) {
       pageDelete(id: $id) { deletedPageId userErrors { code field message } }
     }`,
    { id },
  );

  if (!data.pageDelete.deletedPageId) {
    throw new ShopifyError(
      `Não foi possível excluir a página ${id} em ${client.domain}: ${formatUserErrors(data.pageDelete.userErrors)}`,
      { userErrors: data.pageDelete.userErrors },
    );
  }
}

export async function getPage(
  client: ShopifyClient,
  id: string,
): Promise<ShopifyPage | null> {
  const data = await client.graphql<{ page: ShopifyPage | null }>(
    `query DvflyPage($id: ID!) { page(id: $id) { ${PAGE_FIELDS} } }`,
    { id },
  );
  return data.page;
}

/**
 * Finds a page by handle. Used to make publishing idempotent: if the store
 * already has the page we are about to create, update it instead of creating a
 * duplicate. The competitor's duplication problem (docs/PESQUISA_PAGEFLY.md 3.3)
 * is what happens when this check is missing.
 */
export async function findPageByHandle(
  client: ShopifyClient,
  handle: string,
): Promise<ShopifyPage | null> {
  const data = await client.graphql<{
    pages: { nodes: ShopifyPage[] };
  }>(
    `query DvflyFindPage($query: String!) {
       pages(first: 1, query: $query) { nodes { ${PAGE_FIELDS} } }
     }`,
    { query: `handle:${handle}` },
  );
  return data.pages.nodes.find((page) => page.handle === handle) ?? null;
}

/**
 * Creates or updates by handle, so publishing the same page twice produces one
 * page rather than two. This is the function the app actually calls.
 */
export async function upsertPage(
  client: ShopifyClient,
  input: PageInput & { handle: string },
): Promise<{ page: ShopifyPage; created: boolean }> {
  const existing = await findPageByHandle(client, input.handle);
  if (existing) {
    return { page: await updatePage(client, existing.id, input), created: false };
  }
  return { page: await createPage(client, input), created: true };
}
