/**
 * Turning a page on and off across its stores — the one implementation the
 * editor, the pages list and "delete" all call.
 *
 * Two page kinds, two switches:
 *   - a regular page is a Shopify Page: `isPublished` on and off;
 *   - a product page is a theme template: on = point every linked product at
 *     it (`templateSuffix`), off = release the products back to the theme's
 *     default. The template files stay in the theme either way, so turning
 *     the page back on is instant and needs no recompilation.
 */
import type { Deployment, ProductLink, Store as StoreRow } from '@prisma/client';

import { releaseProducts, setProductTemplate } from '../../../packages/shopify/src/products.ts';
import { productSuffix, removeProductTemplate } from '../../../packages/shopify/src/templates.ts';

import { db } from './db.server.ts';
import { clientFor, updatePage } from './shopify.server.ts';

export type PageKind = 'regular' | 'product';

/**
 * What a deployment IS on the store — a Shopify Page or a product template —
 * read from the id it stored, not from the page's current type. A page can
 * change type after being published; its deployments cannot.
 */
export const deploymentKind = (shopifyGid: string): PageKind =>
  shopifyGid.startsWith('template:') ? 'product' : 'regular';

export interface SwitchOutcome {
  ok: boolean;
  /** One line per store: label, or "label: error". */
  outcomes: string[];
  touched: number;
}

type DeploymentRow = Deployment & { store: StoreRow };

/** Publishes or unpublishes an already-deployed page on every store it is on. */
export async function switchPage(
  pageId: string,
  wantPublished: boolean,
  only?: { storeIds?: string[]; publishedOnly?: boolean },
): Promise<SwitchOutcome> {
  const page = await db.page.findUniqueOrThrow({
    where: { id: pageId },
    include: { deployments: { include: { store: true } }, productLinks: true },
  });
  let deployments: DeploymentRow[] = page.deployments;
  if (only?.storeIds) deployments = deployments.filter((d) => only.storeIds!.includes(d.storeId));
  if (only?.publishedOnly) deployments = deployments.filter((d) => d.isPublished);

  const outcomes: string[] = [];
  let failures = 0;
  for (const deployment of deployments) {
    try {
      if (deploymentKind(deployment.shopifyGid) === 'product') {
        await switchProducts(deployment, page.productLinks, wantPublished, pageId);
      } else {
        await updatePage(clientFor(deployment.store), deployment.shopifyGid, { isPublished: wantPublished });
      }
      await db.deployment.update({ where: { id: deployment.id }, data: { isPublished: wantPublished } });
      outcomes.push(deployment.store.label);
    } catch (error) {
      failures++;
      outcomes.push(`${deployment.store.label}: ${error instanceof Error ? error.message : error}`);
    }
  }
  return { ok: failures === 0, outcomes, touched: deployments.length };
}

async function switchProducts(
  deployment: DeploymentRow,
  links: ProductLink[],
  on: boolean,
  pageId: string,
): Promise<void> {
  const client = clientFor(deployment.store);
  const ids = links.filter((l) => l.storeId === deployment.storeId).map((l) => l.productGid);
  const suffix = productSuffix(pageId);
  if (on) {
    for (const id of ids) await setProductTemplate(client, id, suffix);
  } else {
    await releaseProducts(client, ids, suffix);
  }
}

/**
 * Before a page publishes as one kind, whatever it left on the stores as the
 * OTHER kind is taken down: the Shopify Page goes unpublished, or the linked
 * products are released and the template removed. Otherwise switching a
 * published page from "Normal" to "Produto" would leave the old /pages/ URL
 * live forever, with nothing in the app pointing at it.
 *
 * Returns the stores where the retirement failed; the caller must not publish
 * over a deployment it could not retire.
 */
export async function retireOtherKind(pageId: string, keep: PageKind): Promise<string[]> {
  const page = await db.page.findUniqueOrThrow({
    where: { id: pageId },
    include: { deployments: { include: { store: true } }, productLinks: true },
  });
  const failed: string[] = [];
  for (const deployment of page.deployments) {
    const kind = deploymentKind(deployment.shopifyGid);
    if (kind === keep) continue;
    try {
      const client = clientFor(deployment.store);
      if (kind === 'regular') {
        await updatePage(client, deployment.shopifyGid, { isPublished: false });
      } else {
        await switchProducts(deployment, page.productLinks, false, pageId);
        await removeProductTemplate(client, pageId);
      }
      await db.deployment.delete({ where: { id: deployment.id } });
    } catch (error) {
      failed.push(`${deployment.store.label}: ${error instanceof Error ? error.message : error}`);
    }
  }
  return failed;
}

/**
 * A link added or removed while the page is live on that store takes effect
 * right away — the products a live template applies to should never lag
 * behind what the settings say.
 */
export async function applyLinkNow(
  pageId: string,
  storeId: string,
  productGid: string,
  on: boolean,
): Promise<'applied' | 'not-live'> {
  const deployment = await db.deployment.findUnique({
    where: { pageId_storeId: { pageId, storeId } },
    include: { store: true },
  });
  // Only a live PRODUCT deployment has a template for the product to adopt.
  if (!deployment || !deployment.isPublished || deploymentKind(deployment.shopifyGid) !== 'product') {
    return 'not-live';
  }
  const client = clientFor(deployment.store);
  const suffix = productSuffix(pageId);
  if (on) await setProductTemplate(client, productGid, suffix);
  else await releaseProducts(client, [productGid], suffix);
  return 'applied';
}
