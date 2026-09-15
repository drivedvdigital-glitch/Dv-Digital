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
  const q = query.trim();
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
