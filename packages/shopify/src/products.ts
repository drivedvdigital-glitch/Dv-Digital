/**
 * Products — the resources a product page gets assigned to.
 *
 * A product page is not a page with a URL: it is a theme template, and the
 * products that adopt it are pointed at it through `templateSuffix`. That is
 * the whole binding (docs/MODELOS_DE_TEMA.md): set the suffix and the product's
 * own URL renders our template; clear it and the theme's default returns. No
 * other product and no other template is touched.
 */

import { formatUserErrors, ShopifyError, type ShopifyClient } from './client.ts';

export interface ProductSummary {
  id: string;
  title: string;
  handle: string;
  templateSuffix: string | null;
  imageUrl: string | null;
}

const PRODUCT_FIELDS = `
  id
  title
  handle
  templateSuffix
  featuredMedia { preview { image { url(transform: { maxWidth: 80, maxHeight: 80 }) } } }
`;

type ProductNode = {
  id: string;
  title: string;
  handle: string;
  templateSuffix: string | null;
  featuredMedia: { preview: { image: { url: string } | null } | null } | null;
};

const toSummary = (node: ProductNode): ProductSummary => ({
  id: node.id,
  title: node.title,
  handle: node.handle,
  templateSuffix: node.templateSuffix,
  imageUrl: node.featuredMedia?.preview?.image?.url ?? null,
});

/** Products matching a free-text query, newest first when the query is empty. */
export async function searchProducts(
  client: ShopifyClient,
  query: string,
  first = 10,
): Promise<ProductSummary[]> {
  // What the person typed is a term, never search syntax: quotes, colons and
  // parentheses would otherwise turn "size: 10" into a broken filter.
  const q = query.replace(/["':\\()]/g, ' ').replace(/\s+/g, ' ').trim();
  const data = await client.graphql<{ products: { nodes: ProductNode[] } }>(
    `query DvflyProducts($first: Int!, $query: String, $sortKey: ProductSortKeys!, $reverse: Boolean!) {
       products(first: $first, query: $query, sortKey: $sortKey, reverse: $reverse) {
         nodes { ${PRODUCT_FIELDS} }
       }
     }`,
    {
      first,
      // Shopify's search syntax: a bare term matches title/handle/tags/etc.
      query: q ? `status:active ${q}` : 'status:active',
      sortKey: q ? 'RELEVANCE' : 'UPDATED_AT',
      reverse: !q,
    },
  );
  return data.products.nodes.map(toSummary);
}

/** The suffix a product currently renders with (null = the theme default). */
export async function productTemplateSuffix(
  client: ShopifyClient,
  id: string,
): Promise<string | null | undefined> {
  const data = await client.graphql<{ product: { templateSuffix: string | null } | null }>(
    `query DvflyProductSuffix($id: ID!) { product(id: $id) { templateSuffix } }`,
    { id },
  );
  return data.product ? data.product.templateSuffix : undefined;
}

/** Points a product at a template (`null` returns it to the theme default). */
export async function setProductTemplate(
  client: ShopifyClient,
  id: string,
  templateSuffix: string | null,
): Promise<void> {
  const data = await client.graphql<{
    productUpdate: { product: { id: string; templateSuffix: string | null } | null; userErrors: unknown[] };
  }>(
    `mutation DvflyProductTemplate($product: ProductUpdateInput!) {
       productUpdate(product: $product) {
         product { id templateSuffix }
         userErrors { field message }
       }
     }`,
    { product: { id, templateSuffix } },
  );
  if (!data.productUpdate.product) {
    throw new ShopifyError(
      `Não foi possível vincular o produto ${id} em ${client.domain}: ${formatUserErrors(data.productUpdate.userErrors)}`,
      { userErrors: data.productUpdate.userErrors },
    );
  }
}

/**
 * Returns products to the theme default — but only those still pointing at
 * OUR suffix. A product the merchant meanwhile moved to another template is
 * left exactly as they set it.
 */
export async function releaseProducts(
  client: ShopifyClient,
  ids: string[],
  ourSuffix: string,
): Promise<{ released: string[]; skipped: string[] }> {
  const released: string[] = [];
  const skipped: string[] = [];
  for (const id of ids) {
    const current = await productTemplateSuffix(client, id);
    if (current === ourSuffix) {
      await setProductTemplate(client, id, null);
      released.push(id);
    } else {
      skipped.push(id);
    }
  }
  return { released, skipped };
}

/** The product's handle (the `/products/<handle>` of its URL); undefined when it no longer exists. */
export async function productHandle(client: ShopifyClient, id: string): Promise<string | undefined> {
  const data = await client.graphql<{ product: { handle: string } | null }>(
    `query DvflyProductHandle($id: ID!) { product(id: $id) { handle } }`,
    { id },
  );
  return data.product ? data.product.handle : undefined;
}

/**
 * Changes a product's handle — its URL. `redirectNewHandle: false` on
 * purpose: Shopify would otherwise create a redirect from the old URL to the
 * new one, and in a swap the old URL is about to belong to the other product.
 */
export async function setProductHandle(client: ShopifyClient, id: string, handle: string): Promise<void> {
  const data = await client.graphql<{
    productUpdate: { product: { id: string; handle: string } | null; userErrors: unknown[] };
  }>(
    `mutation DvflyProductHandleSet($product: ProductUpdateInput!) {
       productUpdate(product: $product) {
         product { id handle }
         userErrors { field message }
       }
     }`,
    { product: { id, handle, redirectNewHandle: false } },
  );
  const product = data.productUpdate.product;
  if (!product || product.handle !== handle) {
    throw new ShopifyError(
      `Não foi possível mudar o endereço do produto ${id} para /products/${handle} em ${client.domain}: ` +
        formatUserErrors(data.productUpdate.userErrors),
      { userErrors: data.productUpdate.userErrors },
    );
  }
}

/**
 * Swaps the URLs of two products: A takes B's handle and B takes A's.
 *
 * Handles are unique in a store, so A parks on a temporary handle first.
 * Three writes; if one fails, the ones already made are undone, so the store
 * never stays with one product parked on the temporary URL. Both handles are
 * read first and must be what the caller expects — a product renamed in the
 * admin meanwhile stops the swap before anything changes.
 */
export async function swapProductHandles(
  client: ShopifyClient,
  a: { id: string; handle: string },
  b: { id: string; handle: string },
): Promise<void> {
  const [currentA, currentB] = await Promise.all([productHandle(client, a.id), productHandle(client, b.id)]);
  if (currentA !== a.handle || currentB !== b.handle) {
    throw new ShopifyError(
      `Os endereços mudaram desde o que o D&VFly conhece (esperado /products/${a.handle} e /products/${b.handle}, ` +
        `encontrado ${currentA ? `/products/${currentA}` : 'produto apagado'} e ${currentB ? `/products/${currentB}` : 'produto apagado'}). ` +
        'Nada foi trocado.',
    );
  }
  const parked = `${a.handle}-dvfly-troca-${Date.now().toString(36)}`;
  const done: Array<() => Promise<void>> = [];
  try {
    await setProductHandle(client, a.id, parked);
    done.push(() => setProductHandle(client, a.id, a.handle));
    await setProductHandle(client, b.id, a.handle);
    done.push(() => setProductHandle(client, b.id, b.handle));
    await setProductHandle(client, a.id, b.handle);
  } catch (error) {
    // Undo in reverse order; a failure here is reported with the original one.
    const undoErrors: string[] = [];
    for (const undo of done.reverse()) {
      try {
        await undo();
      } catch (e) {
        undoErrors.push(e instanceof Error ? e.message : String(e));
      }
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new ShopifyError(
      undoErrors.length === 0
        ? `A troca de endereços falhou e foi desfeita; os dois produtos estão como antes. Motivo: ${reason}`
        : `A troca de endereços falhou E não consegui desfazer tudo. Confira no admin da Shopify os produtos ` +
            `/products/${a.handle}, /products/${b.handle} e /products/${parked}. Motivo: ${reason}. ` +
            `Ao desfazer: ${undoErrors.join('; ')}`,
    );
  }
}

/** What a visitor gets at a product's URL, as the store says it now. */
export interface ProductState {
  id: string;
  handle: string;
  title: string;
  /** ACTIVE, DRAFT, ARCHIVED, UNLISTED… as Shopify names it. */
  status: string;
  /** Null when the product is not published to the Online Store channel. */
  onlineStoreUrl: string | null;
  templateSuffix: string | null;
  /** The A/B test entry this product's canonical points at (`dvfly.ab_entry`), if any. */
  abEntry: string | null;
}

/** The products' current state; a deleted product maps to null. */
export async function productStates(client: ShopifyClient, ids: string[]): Promise<Map<string, ProductState | null>> {
  const unique = [...new Set(ids)];
  const out = new Map<string, ProductState | null>(unique.map((id) => [id, null]));
  if (unique.length === 0) return out;
  const data = await client.graphql<{
    nodes: Array<(Omit<ProductState, 'abEntry'> & { abEntry: { value: string } | null }) | null>;
  }>(
    `query DvflyProductStates($ids: [ID!]!) {
       nodes(ids: $ids) {
         ... on Product {
           id handle title status onlineStoreUrl templateSuffix
           abEntry: metafield(namespace: "dvfly", key: "ab_entry") { value }
         }
       }
     }`,
    { ids: unique },
  );
  for (const node of data.nodes) {
    if (node && node.id) {
      const { id, handle, title, status, onlineStoreUrl, templateSuffix, abEntry } = node;
      out.set(id, { id, handle, title, status, onlineStoreUrl, templateSuffix, abEntry: abEntry?.value ?? null });
    }
  }
  return out;
}

/**
 * Why a visitor sent to this product would not see it — in the screen's
 * words — or null when they would. Status only: a draft or a deleted
 * product is a 404 (Shopify's help on URL redirects), and an archived one is
 * hidden from the storefront. Unlisted products open by URL (they are only
 * kept out of search and collections), so they pass.
 */
export function unreachableReason(state: ProductState | null): string | null {
  if (!state) return 'o produto foi apagado da loja';
  if (state.status === 'DRAFT') return 'o produto está como Rascunho na Shopify';
  if (state.status === 'ARCHIVED') return 'o produto está Arquivado na Shopify';
  if (state.status !== 'ACTIVE' && state.status !== 'UNLISTED') return `o produto está com status ${state.status} na Shopify`;
  return null;
}

/**
 * A doubt, not a verdict: Shopify gives no storefront URL for a product that
 * is off the Online Store channel — and also for EVERY product while the
 * store has a password (Shopify staff, community.shopify.dev 32775; dev
 * stores always have one). Said with both causes, and never a reason to stop
 * a test.
 */
export function publicationDoubt(state: ProductState | null): string | null {
  if (!state || unreachableReason(state) || state.onlineStoreUrl) return null;
  return 'a Shopify não deu o endereço dele na loja: ou ele não está publicado no canal Loja virtual (Online Store), ou a loja está com senha';
}

/** A text metafield on products, written or removed in one call per batch. */
export async function setProductTextMetafields(
  client: ShopifyClient,
  namespace: string,
  key: string,
  values: Array<{ productId: string; value: string }>,
): Promise<void> {
  for (let i = 0; i < values.length; i += 25) {
    const data = await client.graphql<{ metafieldsSet: { metafields: unknown[] | null; userErrors: unknown[] } }>(
      `mutation DvflyMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
         metafieldsSet(metafields: $metafields) {
           metafields { id }
           userErrors { field message code }
         }
       }`,
      {
        metafields: values
          .slice(i, i + 25)
          .map((v) => ({ ownerId: v.productId, namespace, key, type: 'single_line_text_field', value: v.value })),
      },
    );
    if (data.metafieldsSet.userErrors.length > 0) {
      throw new ShopifyError(
        `Não foi possível gravar ${namespace}.${key} nos produtos de ${client.domain}: ${formatUserErrors(data.metafieldsSet.userErrors)}`,
        { userErrors: data.metafieldsSet.userErrors },
      );
    }
  }
}

/** Removes a metafield from products; one that is not there is not an error. */
export async function deleteProductMetafields(
  client: ShopifyClient,
  namespace: string,
  key: string,
  productIds: string[],
): Promise<void> {
  const ids = [...new Set(productIds)];
  for (let i = 0; i < ids.length; i += 25) {
    const data = await client.graphql<{ metafieldsDelete: { userErrors: unknown[] } }>(
      `mutation DvflyMetafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
         metafieldsDelete(metafields: $metafields) {
           deletedMetafields { ownerId }
           userErrors { field message }
         }
       }`,
      { metafields: ids.slice(i, i + 25).map((ownerId) => ({ ownerId, namespace, key })) },
    );
    if (data.metafieldsDelete.userErrors.length > 0) {
      throw new ShopifyError(
        `Não foi possível remover ${namespace}.${key} dos produtos de ${client.domain}: ${formatUserErrors(data.metafieldsDelete.userErrors)}`,
        { userErrors: data.metafieldsDelete.userErrors },
      );
    }
  }
}
