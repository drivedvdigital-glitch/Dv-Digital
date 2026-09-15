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

import { ShopifyError } from '../../../packages/shopify/src/client.ts';
import { releaseProducts, setProductTemplate } from '../../../packages/shopify/src/products.ts';
import { productSuffix, removeProductTemplate } from '../../../packages/shopify/src/templates.ts';

import { db } from './db.server.ts';
import { clientFor, storeUsable, updatePage } from './shopify.server.ts';

export type PageKind = 'regular' | 'product';

/**
 * What a deployment IS on the store — a Shopify Page or a product template —
 * read from the id it stored, not from the page's current type. A page can
 * change type after being published; its deployments cannot.
 */
export const deploymentKind = (shopifyGid: string): PageKind =>
  shopifyGid.startsWith('template:') ? 'product' : 'regular';

export const kindLabel = (kind: PageKind): string => (kind === 'product' ? 'modelo de produto' : 'página normal');

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
      let note = '';
      if (deploymentKind(deployment.shopifyGid) === 'product') {
        const { bound, failed } = await switchProducts(deployment, page.productLinks, wantPublished, pageId);
        if (failed.length > 0) {
          // The template is on the store; the products that refused it are
          // named. The switch counts as thrown, with the caveat in the line.
          note = `: ${bound} de ${bound + failed.length} produto(s) aplicado(s); falhou em ${failed.join('; ')}`;
          failures++;
        }
      } else {
        await updatePage(clientFor(deployment.store), deployment.shopifyGid, { isPublished: wantPublished });
      }
      await db.deployment.update({ where: { id: deployment.id }, data: { isPublished: wantPublished } });
      outcomes.push(deployment.store.label + note);
    } catch (error) {
      failures++;
      outcomes.push(`${deployment.store.label}: ${error instanceof Error ? error.message : error}`);
    }
  }
  return { ok: failures === 0, outcomes, touched: deployments.length };
}

/**
 * Points the store's linked products at the template (or releases them).
 * One product refusing (deleted since it was linked) does not stop the rest;
 * it is reported by title.
 */
async function switchProducts(
  deployment: DeploymentRow,
  links: ProductLink[],
  on: boolean,
  pageId: string,
): Promise<{ bound: number; failed: string[] }> {
  const client = clientFor(deployment.store);
  const mine = links.filter((l) => l.storeId === deployment.storeId);
  const suffix = productSuffix(pageId);
  if (!on) {
    await releaseProducts(client, mine.map((l) => l.productGid), suffix);
    return { bound: 0, failed: [] };
  }
  let bound = 0;
  const failed: string[] = [];
  for (const link of mine) {
    try {
      await setProductTemplate(client, link.productGid, suffix);
      bound++;
    } catch (error) {
      failed.push(`"${link.productTitle}" (${error instanceof Error ? error.message : error})`);
    }
  }
  return { bound, failed };
}

/**
 * The deployments a publish as `keep` would have to retire first: everything
 * of the other kind on a store the app can still act on. A store that
 * uninstalled the app is out of reach; its row stays as history.
 */
export async function otherKindDeployments(pageId: string, keep: PageKind): Promise<DeploymentRow[]> {
  const page = await db.page.findUniqueOrThrow({
    where: { id: pageId },
    include: { deployments: { include: { store: true } } },
  });
  return page.deployments.filter((d) => deploymentKind(d.shopifyGid) !== keep && storeUsable(d.store));
}

/**
 * Before a page publishes as one kind, whatever it left on the stores as the
 * OTHER kind is taken down: the Shopify Page goes unpublished, or the linked
 * products are released and the template removed. Otherwise switching a
 * published page from "Normal" to "Produto" would leave the old /pages/ URL
 * live forever, with nothing in the app pointing at it.
 *
 * A resource the merchant already deleted on the store counts as retired.
 * Returns the store labels retired and the ones where it failed; the caller
 * must not publish over a deployment it could not retire.
 */
export async function retireOtherKind(
  pageId: string,
  keep: PageKind,
): Promise<{ retired: string[]; failed: string[] }> {
  const links = await db.productLink.findMany({ where: { pageId } });
  const retired: string[] = [];
  const failed: string[] = [];
  for (const deployment of await otherKindDeployments(pageId, keep)) {
    try {
      const client = clientFor(deployment.store);
      try {
        if (deploymentKind(deployment.shopifyGid) === 'regular') {
          await updatePage(client, deployment.shopifyGid, { isPublished: false });
        } else {
          await switchProducts(deployment, links, false, pageId);
          await removeProductTemplate(client, pageId);
        }
      } catch (error) {
        if (!(error instanceof ShopifyError && error.isNotFound)) throw error;
      }
      await db.deployment.delete({ where: { id: deployment.id } });
      retired.push(deployment.store.label);
    } catch (error) {
      failed.push(`${deployment.store.label}: ${error instanceof Error ? error.message : error}`);
    }
  }
  return { retired, failed };
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
