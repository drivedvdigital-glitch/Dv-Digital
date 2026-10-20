/**
 * "Trocar de tema": what has to be carried into another theme before the
 * store publishes it, and carrying it one item at a time (one request each,
 * so a slow store never hits a request time limit and a failure stays on its
 * own row). The work itself is in packages/shopify/src/theme-prep.ts.
 */

import type { Store as StoreRow } from '@prisma/client';

import type { ShopifyClient } from '../../../packages/shopify/src/client.ts';
import { productStates } from '../../../packages/shopify/src/products.ts';
import { splitSuffix } from '../../../packages/shopify/src/split.ts';
import { listThemes, productSuffix, readThemeFiles, SOLO_SUFFIX, type ThemeInfo } from '../../../packages/shopify/src/templates.ts';
import {
  checkPlan,
  checkSplit,
  isOurSuffix,
  planTemplate,
  prepareSplit,
  templateUses,
  writePlan,
  type ItemCheck,
  type ItemOutcome,
  type TemplateResource,
  type TemplateUse,
} from '../../../packages/shopify/src/theme-prep.ts';
import { splitPlanFor } from './ab.server.ts';

// The route reaches the package only through this module (server-only code
// stays out of the browser bundle).
export { listThemes } from '../../../packages/shopify/src/templates.ts';
export { appEmbeds, disableAppEmbeds, missingTemplates, type AppEmbed } from '../../../packages/shopify/src/theme-prep.ts';
import { db } from './db.server.ts';

export interface PrepItem {
  /** Stable id of the row: `product:dvfly-x`, `page:dvfly-solo`, `ab:<test id>`. */
  key: string;
  kind: 'template' | 'split';
  resource?: TemplateResource;
  suffix?: string;
  testId?: string;
  /** What the merchant calls it. */
  label: string;
  /** "Página de produto", "Página", "Teste A | B". */
  type: string;
  /** Products or pages pointing at it now. */
  usedBy: string[];
  note: string | null;
}

export interface Inventory {
  items: PrepItem[];
  /** Alternate templates in use that are not D&VFly's: the new theme must have them, or those products show the default page. */
  foreign: TemplateUse[];
}

/**
 * Everything the store reaches through D&VFly's templates — from the
 * products and pages themselves (the truth) and from the database (pages
 * switched off in the list, which come back on without being republished,
 * and the live A | B tests). Pages first, then products, the tests last: a
 * test's version A may be one of those product pages, and its copy is taken
 * from the target theme.
 */
export async function prepInventory(store: StoreRow, client: ShopifyClient): Promise<Inventory> {
  const uses = await templateUses(client);
  const deployments = await db.deployment.findMany({
    where: { storeId: store.id },
    include: { page: { select: { id: true, title: true, pageType: true } } },
  });
  const live = await db.abTest.findMany({
    where: { storeId: store.id, status: 'live' },
    select: { id: true, name: true, entryTitle: true, entryHandle: true, previousSuffix: true },
  });
  const titleOf = (pageId: string) => deployments.find((d) => d.page.id.toLowerCase() === pageId.toLowerCase())?.page.title ?? null;

  const items: PrepItem[] = [];
  const add = (item: PrepItem) => {
    if (!items.some((i) => i.key === item.key)) items.push(item);
  };
  const liveSuffixes = new Set(live.map((t) => splitSuffix(t.id)));

  for (const use of uses.filter((u) => isOurSuffix(u.suffix))) {
    if (use.resource === 'product' && liveSuffixes.has(use.suffix)) continue; // the test row covers it
    const key = `${use.resource}:${use.suffix}`;
    if (use.resource === 'page') {
      const pageId = use.suffix.replace(/^dvfly-pg-/i, '');
      add({
        key,
        kind: 'template',
        resource: 'page',
        suffix: use.suffix,
        label: use.suffix === SOLO_SUFFIX ? 'Páginas sem o cabeçalho e o rodapé do tema' : (titleOf(pageId) ?? use.titles[0] ?? use.suffix),
        type: 'Página',
        usedBy: use.titles,
        note: null,
      });
    } else if (/^dvfly-ab-/i.test(use.suffix)) {
      add({
        key,
        kind: 'template',
        resource: 'product',
        suffix: use.suffix,
        label: `Teste A | B que não está no ar (${use.suffix})`,
        type: 'Teste A | B (fora do ar)',
        usedBy: use.titles,
        note: 'o produto ainda aponta para um teste que o D&VFly não tem no ar: copiado como está',
      });
    } else {
      add({
        key,
        kind: 'template',
        resource: 'product',
        suffix: use.suffix,
        label: titleOf(use.suffix.replace(/^dvfly-/i, '')) ?? use.titles[0] ?? use.suffix,
        type: 'Página de produto',
        usedBy: use.titles,
        note: null,
      });
    }
  }

  // Product pages no product points at right now: turning them back on in
  // the list re-points the products without writing files, so the files
  // must be in the new theme too.
  for (const d of deployments) {
    // What was deployed, not what the page is now: a page switched from
    // product to regular keeps its product deployment until republished.
    if (!d.shopifyGid.startsWith('template:product.')) continue;
    const suffix = d.shopifyGid.slice('template:product.'.length) || productSuffix(d.page.id);
    add({
      key: `product:${suffix}`,
      kind: 'template',
      resource: 'product',
      suffix,
      label: d.page.title,
      type: 'Página de produto',
      usedBy: [],
      note: 'nenhum produto usa esta página agora; ela fica pronta para quando for ligada de novo',
    });
  }

  // Version A's own template, for each live test: one of ours must be
  // carried before the test (it is, by the order below); someone else's is
  // a warning the new theme must answer.
  const foreign = uses.filter((u) => !isOurSuffix(u.suffix));
  for (const t of live) {
    const a = t.previousSuffix;
    if (!a) continue;
    if (/^dvfly-(?!ab-)/i.test(a)) {
      add({
        key: `product:${a}`,
        kind: 'template',
        resource: 'product',
        suffix: a,
        label: titleOf(a.replace(/^dvfly-/i, '')) ?? a,
        type: 'Página de produto',
        usedBy: [`versão A de «${t.name}»`],
        note: null,
      });
    } else if (!isOurSuffix(a)) {
      const use = foreign.find((u) => u.resource === 'product' && u.suffix === a);
      if (use) use.titles.push(`versão A de «${t.name}»`);
      else foreign.push({ resource: 'product', suffix: a, titles: [`versão A de «${t.name}»`] });
    }
  }

  for (const t of live) {
    add({
      key: `ab:${t.id}`,
      kind: 'split',
      testId: t.id,
      label: t.name,
      type: 'Teste A | B',
      usedBy: [t.entryTitle || t.entryHandle],
      note: null,
    });
  }

  const order = (i: PrepItem) => (i.kind === 'split' ? 2 : i.resource === 'page' ? 0 : 1);
  items.sort((a, b) => order(a) - order(b));
  return { items, foreign };
}

export interface ThemePair {
  source: ThemeInfo;
  target: ThemeInfo;
  /** The target is already the published theme: only what is missing or older there is written (a newer file there wins). */
  repair: boolean;
}

/**
 * The two themes of an operation, checked against the store's own list (an
 * id typed into a request is never trusted): one of them is the published
 * one, they differ, and the target is not still being unpacked.
 */
export async function themePair(client: ShopifyClient, sourceId: string, targetId: string): Promise<ThemePair | string> {
  const themes = await listThemes(client);
  const source = themes.find((t) => t.id === sourceId);
  const target = themes.find((t) => t.id === targetId);
  if (!source || !target) return 'Tema não encontrado nesta loja. Recarregue a página.';
  if (source.id === target.id) return 'Escolha um tema diferente do tema de origem.';
  if (source.role !== 'MAIN' && target.role !== 'MAIN') return 'Um dos dois temas precisa ser o publicado.';
  if (target.processing) return 'A Shopify ainda está processando este tema. Espere terminar e tente de novo.';
  if (target.processingFailed) return 'A Shopify não conseguiu processar este tema. Envie o arquivo do tema de novo.';
  return { source, target, repair: target.role === 'MAIN' };
}

async function splitPlan(client: ShopifyClient, storeId: string, testId: string, origin: string) {
  const test = await db.abTest.findFirst({ where: { id: testId, storeId, status: 'live' }, include: { variants: true } });
  if (!test) return null;
  const states = await productStates(client, [test.entryProductGid, ...test.variants.map((v) => v.productGid)]);
  return splitPlanFor(test, states, test.trackerOrigin ?? origin).plan;
}

/**
 * Which unpublished theme a "complete" run should take files from when the
 * screen does not say: the one holding most of the templates this store
 * uses — the theme that was just replaced — not whichever Shopify lists
 * first. Ties go to the most recently updated.
 */
export async function likelySource(client: ShopifyClient, candidates: ThemeInfo[], items: PrepItem[]): Promise<ThemeInfo | null> {
  const names = items
    .filter((i) => i.kind === 'template')
    .slice(0, 50)
    .map((i) => `templates/${i.resource}.${i.suffix}.json`);
  let best: { theme: ThemeInfo; found: number } | null = null;
  for (const theme of candidates.slice(0, 20)) {
    const found = names.length > 0 ? (await readThemeFiles(client, theme.id, names)).filter((t) => t !== null).length : 0;
    if (!best || found > best.found || (found === best.found && theme.updatedAt > best.theme.updatedAt)) best = { theme, found };
  }
  return best?.theme ?? null;
}

/** Carries one item into the target theme. */
export async function prepareItem(
  store: StoreRow,
  client: ShopifyClient,
  pair: ThemePair,
  item: PrepItem,
  origin: string,
): Promise<ItemOutcome> {
  if (item.kind === 'split') {
    const plan = await splitPlan(client, store.id, item.testId!, origin);
    if (!plan) return { status: 'falhou', written: [], problem: 'o teste não está mais no ar', notes: [] };
    const outcome = await prepareSplit(client, pair.target.id, plan);
    // The published theme now runs the test this way: the test screen
    // describes it from these two fields, as after going live.
    if (pair.repair && outcome.status === 'pronto') {
      await db.abTest.update({ where: { id: item.testId! }, data: { entryMode: outcome.mode, entryModeNote: outcome.note } });
    }
    return outcome;
  }
  const plan = await planTemplate(client, pair.source.id, pair.target.id, item.resource!, item.suffix!);
  return writePlan(client, pair.target.id, plan, { completing: pair.repair });
}

/** Reads one item back from the target theme, writing nothing. */
export async function checkItem(store: StoreRow, client: ShopifyClient, pair: ThemePair, item: PrepItem, origin: string): Promise<ItemCheck> {
  if (item.kind === 'split') {
    const plan = await splitPlan(client, store.id, item.testId!, origin);
    if (!plan) return { status: 'falhou', detail: 'o teste não está mais no ar' };
    return checkSplit(client, pair.target.id, item.testId!, plan.entry?.template ?? null);
  }
  const plan = await planTemplate(client, pair.source.id, pair.target.id, item.resource!, item.suffix!);
  return checkPlan(client, pair.target.id, plan, { completing: pair.repair });
}
