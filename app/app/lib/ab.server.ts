/**
 * "Teste A | B" on the server: putting a test live and taking it down on the
 * store, counting arrivals, keeping the light copy of orders, and the report.
 *
 * The storefront half is `packages/shopify/src/split.ts`; the arithmetic is
 * `ab.ts`. This file is the glue, and the one place that knows both.
 */
import type { AbTest, AbVariant, Store as StoreRow } from '@prisma/client';

import { ordersUpdatedSince, shopInfo } from '../../../packages/shopify/src/orders.ts';
import {
  productHandle,
  productStates,
  productTemplateSuffix,
  publicationDoubt,
  setProductTemplate,
  swapProductHandles,
  unreachableReason,
  type ProductState,
} from '../../../packages/shopify/src/products.ts';
import {
  ensureSplitTemplate,
  entryCopyChanged,
  inspectVariantCanonicals,
  pointVariantCanonicals,
  releaseVariantCanonicals,
  removeSplitTemplate,
  splitSuffix,
  type CanonicalState,
} from '../../../packages/shopify/src/split.ts';

import {
  addDays,
  closeSpan,
  currentSpanStart,
  dayStart,
  daysBetween,
  estimate,
  inSpans,
  liveMs,
  localDay,
  openSpan,
  parseSpans,
  serializeSpans,
  verdict,
  type Estimate,
  type Span,
} from './ab.ts';
import { config } from './config.server.ts';
import { db } from './db.server.ts';
import { clientFor } from './shopify.server.ts';

export const HIT_PATH = '/ab/hit';

type TestWithVariants = AbTest & { variants: AbVariant[] };

const ordered = (test: TestWithVariants) => [...test.variants].sort((a, b) => a.position - b.position);
/** Variants are named by letter on screen: A, B, C… */
const letterOf = (i: number) => String.fromCharCode(65 + i);
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** What a check of the pages needs: the entry and the versions, in screen order. */
interface TestPages {
  entryProductGid: string;
  entryHandle: string;
  variants: Array<{ productGid: string; handle: string; weight: number }>;
}

/**
 * Before anyone is sent anywhere: every product a visitor can land on must
 * open. A version with visitors whose product is a draft, archived or deleted
 * would be a 404 for its share of the ad; the entry would be a 404 for all of
 * it. A version at 0% may be anything — it receives nobody.
 */
function unreachable(pages: TestPages, states: Map<string, ProductState | null>): string | null {
  const entry = unreachableReason(states.get(pages.entryProductGid) ?? null);
  if (entry) return `A URL de entrada (/products/${pages.entryHandle}) não abriria: ${entry}. Nada mudou na loja.`;
  for (const [i, v] of pages.variants.entries()) {
    if (v.weight === 0 || v.productGid === pages.entryProductGid) continue;
    const problem = unreachableReason(states.get(v.productGid) ?? null);
    if (problem) {
      return (
        `Versão ${letterOf(i)} (/products/${v.handle}): ${problem}, e quem fosse mandado para ela veria uma página de erro. ` +
        'Ative o produto na Shopify ou deixe essa versão em 0%. Nada mudou na loja.'
      );
    }
  }
  return null;
}

/**
 * Products in use by ANOTHER live test, as its entry or a version, with that
 * test's name. A product is in one live test at a time: two would chain their
 * redirects (a visitor sent twice, counted twice) and fight over its
 * canonical, each one's go-live or pause undoing the other's.
 */
async function claimedByOthers(storeId: string, testId: string): Promise<Map<string, string>> {
  const tests = await db.abTest.findMany({
    where: { storeId, status: 'live', id: { not: testId } },
    select: { name: true, entryProductGid: true, variants: { select: { productGid: true } } },
  });
  const claimed = new Map<string, string>();
  for (const t of tests) {
    claimed.set(t.entryProductGid, t.name);
    for (const v of t.variants) claimed.set(v.productGid, t.name);
  }
  return claimed;
}

/** The first of these pages another live test is using, said in the screen's words. */
async function conflictWith(storeId: string, testId: string, pages: TestPages): Promise<string | null> {
  const claimed = await claimedByOthers(storeId, testId);
  const all = [{ productGid: pages.entryProductGid, handle: pages.entryHandle }, ...pages.variants];
  const taken = all.find((p) => claimed.has(p.productGid));
  if (!taken) return null;
  return (
    `/products/${taken.handle} já está no teste "${claimed.get(taken.productGid)}", que está no ar. ` +
    'Um produto só pode estar num teste no ar por vez: pause aquele teste ou escolha outro produto. Nada mudou na loja.'
  );
}

/**
 * The checks a configuration must pass before it is saved for the store:
 * every page that receives visitors opens, and none is in another live test.
 */
export async function pagesProblem(store: StoreRow, testId: string, pages: TestPages): Promise<string | null> {
  const states = await productStates(clientFor(store), [pages.entryProductGid, ...pages.variants.map((v) => v.productGid)]);
  return unreachable(pages, states) ?? (await conflictWith(store.id, testId, pages));
}

/**
 * Takes `dvfly.ab_entry` off these products, giving them their own canonical
 * back — except where another live test put it (its own version: not ours to
 * remove). Products that no longer exist are skipped: Shopify would refuse
 * the whole call for one unknown owner.
 */
async function releaseCanonicals(
  client: ReturnType<typeof clientFor>,
  storeId: string,
  testId: string,
  productIds: string[],
  known?: Map<string, ProductState | null>,
): Promise<void> {
  if (productIds.length === 0) return;
  const claimed = await claimedByOthers(storeId, testId);
  const states = known ?? (await productStates(client, productIds));
  const ids = productIds.filter((id) => states.get(id)?.abEntry && !claimed.has(id));
  if (ids.length > 0) await releaseVariantCanonicals(client, ids);
}

const spansOf = (test: AbTest) => parseSpans(test.liveSpans, test);

export interface GoLiveResult {
  /** "stay": version A opens on the entry URL with no redirect; "view": through `?view=`. */
  mode: 'stay' | 'view' | null;
  /** What was observed about version A's page (why it is not on its own page, or a template that is gone). */
  modeNote: string | null;
  /** The canonical step failed (the test is live anyway). */
  canonicalError: string | null;
}

/**
 * Puts the test on the store (or rewrites it after an edit): checks that every
 * page a visitor can land on opens and is in no other live test, writes the
 * theme files, points the entry product at them and the variants' canonical
 * at the entry. The entry product's own template is remembered the first
 * time, so pausing can give it back.
 *
 * Handles renamed in the admin are followed — in memory first, and saved only
 * once the store runs them, so a failed write never hides the rename.
 */
export async function goLive(test: TestWithVariants, store: StoreRow, origin: string): Promise<GoLiveResult> {
  const client = clientFor(store);
  const suffix = splitSuffix(test.id);
  const states = await productStates(client, [test.entryProductGid, ...test.variants.map((v) => v.productGid)]);
  const handleNow = (gid: string, known: string) => states.get(gid)?.handle ?? known;
  const variants = ordered(test).map((v) => ({ ...v, handle: handleNow(v.productGid, v.handle) }));
  const entryHandle = handleNow(test.entryProductGid, test.entryHandle);
  const pages = { entryProductGid: test.entryProductGid, entryHandle, variants };
  const refusal = unreachable(pages, states) ?? (await conflictWith(store.id, test.id, pages));
  if (refusal) throw new Error(refusal);
  const others = variants.filter((v) => v.productGid !== test.entryProductGid);

  const current = states.get(test.entryProductGid)!.templateSuffix;
  // Only a suffix that is not ours is worth remembering: re-applying a live
  // test must not overwrite the original with our own.
  const previousSuffix = current === suffix ? test.previousSuffix : current;
  const entryVariant = variants.find((v) => v.productGid === test.entryProductGid);
  const split = await ensureSplitTemplate(client, {
    testId: test.id,
    name: test.name,
    hitUrl: new URL(HIT_PATH, origin).href,
    variants: variants.map((v) => ({ id: v.id, handle: v.handle, weight: v.weight })),
    ...(entryVariant ? { entry: { variantId: entryVariant.id, template: previousSuffix ?? null } } : {}),
  });
  await setProductTemplate(client, test.entryProductGid, suffix);

  // The store runs the test from here: recorded at once, so the clicks that
  // arrive during the canonical step below are counted.
  const liveFrom = new Date();
  await db.$transaction([
    db.abTest.update({
      where: { id: test.id },
      data: {
        status: 'live',
        trackerOrigin: origin,
        previousSuffix,
        startedAt: test.startedAt ?? liveFrom,
        entryMode: split.mode,
        entryModeNote: split.note,
        entryHandle,
        applyError: null,
        goalReachedAt: null,
        liveSpans: serializeSpans(openSpan(spansOf(test), liveFrom)),
      },
    }),
    ...variants.map((v) => db.abVariant.update({ where: { id: v.id }, data: { handle: v.handle } })),
    ...[{ productGid: test.entryProductGid, handle: entryHandle }, ...variants].map((p) =>
      db.productLink.updateMany({ where: { storeId: store.id, productGid: p.productGid }, data: { productHandle: p.handle } }),
    ),
  ]);
  forgetTest(test.id);

  let canonicalError: string | null = null;
  try {
    // The entry answers with its own canonical; the versions with the entry's.
    await releaseCanonicals(client, store.id, test.id, [test.entryProductGid], states);
    await pointVariantCanonicals(
      client,
      entryHandle,
      others
        .filter((v) => states.get(v.productGid))
        .map((v) => ({ id: v.productGid, templateSuffix: states.get(v.productGid)!.templateSuffix })),
    );
  } catch (error) {
    // Search engines are not worth failing a go-live for: the test runs, and
    // the screen says the canonical step did not.
    canonicalError = errorText(error);
  }
  // From here on, orders matter: sync from the start of the test.
  if (!store.ordersSyncedTo) {
    await db.store.update({ where: { id: store.id }, data: { ordersSyncedTo: new Date(Date.now() - 24 * 3600_000) } });
  }
  return { mode: split.mode, modeNote: split.note, canonicalError };
}

/**
 * A configuration saved for a live test that did not reach the store: the
 * store keeps running the previous one until it does. Remembered, so the
 * screen says it until a write succeeds.
 */
export async function rememberApplyError(testId: string, error: unknown): Promise<string> {
  const message = errorText(error);
  await db.abTest.update({ where: { id: testId }, data: { applyError: message } });
  return message;
}

/**
 * Before a live edit removes versions: their canonical goes back to their own
 * NOW, before the app forgets they were in the test — afterwards nothing
 * would know to release them.
 */
export async function releaseDropped(store: StoreRow, testId: string, productIds: string[]): Promise<void> {
  await releaseCanonicals(clientFor(store), store.id, testId, productIds);
}

/**
 * Gives the entry product back the template it had — only if it still points
 * at ours (a merchant who moved it meanwhile keeps their choice) — and the
 * variants their own canonical. The theme files stay: resuming is one click
 * and rewrites them anyway.
 */
export async function pause(
  test: TestWithVariants,
  store: StoreRow,
): Promise<{ restored: boolean; canonicalError: string | null }> {
  const client = clientFor(store);
  const current = await productTemplateSuffix(client, test.entryProductGid);
  let restored = false;
  if (current === splitSuffix(test.id)) {
    await setProductTemplate(client, test.entryProductGid, test.previousSuffix ?? null);
    restored = true;
  }
  await db.abTest.update({
    where: { id: test.id },
    data: { status: 'paused', entryMode: null, entryModeNote: null, liveSpans: serializeSpans(closeSpan(spansOf(test), new Date())) },
  });
  forgetTest(test.id);
  const canonicalError = await releaseAll(test, store);
  return { restored, canonicalError };
}

/** Every version's own canonical back; the error, in words, when it failed. */
async function releaseAll(test: TestWithVariants, store: StoreRow): Promise<string | null> {
  try {
    await releaseCanonicals(
      clientFor(store),
      store.id,
      test.id,
      test.variants.filter((v) => v.productGid !== test.entryProductGid).map((v) => v.productGid),
    );
    return null;
  } catch (error) {
    return errorText(error);
  }
}

/**
 * Pause (when live) and take the files out of the theme; the caller deletes
 * the row — but not when the versions' canonical could not be given back
 * (`canonicalError`): the row is the only record of which products to fix.
 * Not live, the release is tried again (it is idempotent): a pause whose
 * release failed gets its retry here.
 */
export async function takeDown(test: TestWithVariants, store: StoreRow): Promise<{ canonicalError: string | null }> {
  let canonicalError: string | null = null;
  if (test.status === 'live') ({ canonicalError } = await pause(test, store));
  else if (test.status !== 'draft') canonicalError = await releaseAll(test, store);
  if (test.status !== 'draft') await removeSplitTemplate(clientFor(store), test.id);
  forgetTest(test.id);
  return { canonicalError };
}

/** The handles the app remembers for a product, after its URL changed on the store. */
async function rememberHandle(storeId: string, testId: string, productGid: string, handle: string): Promise<void> {
  await db.abVariant.updateMany({ where: { testId, productGid }, data: { handle } });
  await db.productLink.updateMany({ where: { storeId, productGid }, data: { productHandle: handle } });
}

/** A swap would move a product another live test sends visitors to: refused before anything changes. */
async function swapConflict(store: StoreRow, test: TestWithVariants, productGids: string[]): Promise<void> {
  const claimed = await claimedByOthers(store.id, test.id);
  const taken = productGids.find((gid) => claimed.has(gid));
  if (taken) {
    throw new Error(
      `Um dos produtos da troca está no teste "${claimed.get(taken)}", que está no ar: trocar o endereço dele quebraria aquele teste. ` +
        'Pause aquele teste primeiro. Nada foi feito.',
    );
  }
}

/**
 * Ends the test with a winner. The test comes off the store first (the entry
 * gets its own page back, our theme files go). Then, when the winner is not
 * the entry itself, the two products swap URLs: the winner takes the entry's
 * `/products/<handle>` — the one in the ads — and the entry product takes the
 * winner's old one. Nothing else moves: each product keeps its page, price,
 * variants, reviews and orders; what changes is which product answers at
 * which address.
 */
export async function promote(
  test: TestWithVariants,
  store: StoreRow,
  variantId: string,
): Promise<{ swapped: boolean; canonicalError: string | null }> {
  const winner = test.variants.find((v) => v.id === variantId);
  if (!winner) throw new Error('Essa versão não é deste teste.');
  if (test.status === 'ended') throw new Error('O teste já foi encerrado.');
  const client = clientFor(store);
  const swaps = winner.productGid !== test.entryProductGid;
  if (swaps) {
    // Checked BEFORE taking the test down: a product renamed in the admin
    // would only be found by the swap, after the test was already off.
    await swapConflict(store, test, [test.entryProductGid, winner.productGid]);
    const [entryNow, winnerNow] = await Promise.all([
      productHandle(client, test.entryProductGid),
      productHandle(client, winner.productGid),
    ]);
    if (entryNow !== test.entryHandle || winnerNow !== winner.handle) {
      throw new Error(
        `O endereço de um dos produtos mudou na Shopify (esperado /products/${test.entryHandle} e /products/${winner.handle}, ` +
          `encontrado ${entryNow ? `/products/${entryNow}` : 'produto apagado'} e ${winnerNow ? `/products/${winnerNow}` : 'produto apagado'}). ` +
          'Nada foi feito; o teste continua como estava.',
      );
    }
  }
  const { canonicalError } = await takeDown(test, store);
  if (swaps) {
    try {
      await swapProductHandles(
        client,
        { id: test.entryProductGid, handle: test.entryHandle },
        { id: winner.productGid, handle: winner.handle },
      );
    } catch (error) {
      throw new Error(`O teste foi pausado, mas a troca de endereços não aconteceu: ${errorText(error)}`);
    }
    await rememberHandle(store.id, test.id, test.entryProductGid, winner.handle);
    await rememberHandle(store.id, test.id, winner.productGid, test.entryHandle);
  }
  await db.abTest.update({
    where: { id: test.id },
    data: {
      status: 'ended',
      promotedVariantId: swaps ? winner.id : null,
      ...(swaps ? { entryHandle: winner.handle } : {}),
    },
  });
  forgetTest(test.id);
  return { swapped: swaps, canonicalError };
}

/** Swaps the two URLs back and leaves the test paused, ready to run again. */
export async function undoPromotion(test: TestWithVariants, store: StoreRow): Promise<void> {
  if (test.status !== 'ended' || !test.promotedVariantId) throw new Error('Não há troca de endereços para desfazer.');
  const winner = test.variants.find((v) => v.id === test.promotedVariantId);
  if (!winner) throw new Error('A versão que ganhou foi removida do teste; desfaça a troca pelo admin da Shopify.');
  await swapConflict(store, test, [test.entryProductGid, winner.productGid]);
  // Now: the entry product sits at the winner's old URL, the winner at the entry's.
  const entryUrl = winner.handle;
  const winnerUrl = test.entryHandle;
  await swapProductHandles(
    clientFor(store),
    { id: test.entryProductGid, handle: winnerUrl },
    { id: winner.productGid, handle: entryUrl },
  );
  await rememberHandle(store.id, test.id, test.entryProductGid, entryUrl);
  await rememberHandle(store.id, test.id, winner.productGid, winnerUrl);
  await db.abTest.update({
    where: { id: test.id },
    data: { status: 'paused', promotedVariantId: null, entryHandle: entryUrl },
  });
  forgetTest(test.id);
}

/**
 * Products that are the entry of a LIVE test, among `links` — publishing a
 * D&VFly product page must not point them at the page: that would switch
 * the test off without anyone deciding to. The page's template is still
 * written, and the test is told it is now the entry's own page (version A
 * shows it; pausing restores it).
 */
export async function liveEntriesAmong(links: Array<{ storeId: string; productGid: string }>) {
  if (links.length === 0) return [];
  return db.abTest.findMany({
    where: {
      status: 'live',
      OR: links.map((l) => ({ storeId: l.storeId, entryProductGid: l.productGid })),
    },
    include: { variants: true, store: true },
  });
}

/**
 * After a page published over a live test's entry: the page is now what the
 * entry shows as itself. Rewritten even when it already was — version A
 * shows on the entry through a COPY of its template and layout, and a
 * republish has just changed the originals.
 */
export async function adoptEntryPage(
  test: TestWithVariants & { store: StoreRow },
  pageSuffix: string,
): Promise<void> {
  if (test.previousSuffix !== pageSuffix) {
    await db.abTest.update({ where: { id: test.id }, data: { previousSuffix: pageSuffix } });
  }
  const fresh = await db.abTest.findUniqueOrThrow({ where: { id: test.id }, include: { variants: true } });
  if (!test.trackerOrigin) return;
  try {
    await goLive(fresh, test.store, test.trackerOrigin);
  } catch (error) {
    throw new Error(await rememberApplyError(test.id, error));
  }
}

// ---- arrivals ---------------------------------------------------------------

/**
 * Not counted (they are still REDIRECTED like anyone else — the split never
 * looks at who is asking; only the report does): crawlers and link previews
 * that run JavaScript, and PageSpeed/Lighthouse.
 */
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|meta-externalagent|lighthouse|headlesschrome|pagespeed|preview/i;

/**
 * Arrivals per IP per minute before the rest is ignored (a reload loop, a
 * script). Generous on purpose: mobile carriers put thousands of phones behind
 * one IP (CGNAT), and an ad that takes off must not be cut at the counter.
 */
const PER_MINUTE = 600;
const seen = new Map<string, { minute: number; count: number }>();

function overLimit(ip: string): boolean {
  const minute = Math.floor(Date.now() / 60_000);
  if (seen.size > 20_000) {
    for (const [key, value] of seen) if (value.minute !== minute) seen.delete(key);
  }
  const entry = seen.get(ip);
  if (!entry || entry.minute !== minute) {
    seen.set(ip, { minute, count: 1 });
    return false;
  }
  entry.count++;
  return entry.count > PER_MINUTE;
}

export type HitOutcome = 'counted' | 'bot' | 'limited' | 'unknown' | 'not-live';

/**
 * Which test a variant belongs to and whether that test is live, remembered
 * for a few seconds: an ad that takes off sends thousands of arrivals a
 * minute for the same handful of variants, and none of them needs its own
 * database read. A status change in this process forgets the test at once
 * (`forgetTest`); the TTL bounds anything else.
 */
const VARIANT_TTL_MS = 15_000;
const variantCache = new Map<string, { testId: string; live: boolean; until: number }>();
/**
 * Bumped by every status change: a read that started before the change must
 * not be remembered after it (it would hold the old status for 15 s).
 */
let statusGeneration = 0;

async function variantInfo(variantId: string): Promise<{ testId: string; live: boolean } | null> {
  const now = Date.now();
  const known = variantCache.get(variantId);
  if (known && known.until > now) return known;
  const generation = statusGeneration;
  const row = await db.abVariant.findUnique({
    where: { id: variantId },
    select: { testId: true, test: { select: { status: true } } },
  });
  if (!row) return null;
  const info = { testId: row.testId, live: row.test.status === 'live', until: now + VARIANT_TTL_MS };
  if (generation === statusGeneration) {
    if (variantCache.size > 5_000) variantCache.clear();
    variantCache.set(variantId, info);
  }
  return info;
}

/** Called on every status change of a test, so arrivals see it at once. */
function forgetTest(testId: string): void {
  statusGeneration++;
  for (const [variantId, info] of variantCache) if (info.testId === testId) variantCache.delete(variantId);
}

/**
 * Arrivals are added up in memory and written every FLUSH_MS, one upsert per
 * variant and hour — the database sees a handful of writes every couple of
 * seconds however many visitors arrive. The visitor never waits for any of it
 * (the beacon is fire-and-forget), so this is only about how much traffic the
 * counter itself takes before it starts dropping counts.
 *
 * On a serverless host the instance may be frozen right after answering, with
 * a timer pending forever: there every arrival is written before the answer.
 */
const FLUSH_MS = 2_000;
const WRITE_THROUGH = config.abWriteThrough;
const pendingHits = new Map<string, { testId: string; variantId: string; hour: Date; clicks: number; visitors: number }>();
const pendingLast = new Map<string, Date>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushChain: Promise<void> = Promise.resolve();

function addPending(testId: string, variantId: string, hour: Date, clicks: number, visitors: number): void {
  const key = `${variantId}|${hour.getTime()}`;
  const entry = pendingHits.get(key);
  if (entry) {
    entry.clicks += clicks;
    entry.visitors += visitors;
  } else {
    pendingHits.set(key, { testId, variantId, hour, clicks, visitors });
  }
}

async function writePending(): Promise<void> {
  if (pendingHits.size === 0 && pendingLast.size === 0) return;
  const batch = [...pendingHits.values()];
  const last = [...pendingLast];
  pendingHits.clear();
  pendingLast.clear();
  const counted = new Set<string>();
  for (const p of batch) {
    const where = { variantId_hour: { variantId: p.variantId, hour: p.hour } };
    const increment = { clicks: { increment: p.clicks }, visitors: { increment: p.visitors } };
    try {
      try {
        await db.abStat.upsert({
          where,
          create: { variantId: p.variantId, testId: p.testId, hour: p.hour, clicks: p.clicks, visitors: p.visitors },
          update: increment,
        });
      } catch (error) {
        // A variant removed from its test meanwhile: its counts go with it.
        if (!(await db.abVariant.findUnique({ where: { id: p.variantId }, select: { id: true } }))) continue;
        // Only a lost race on creating the hour's row is retried as an
        // update. Any other error may have come AFTER the write committed
        // (a connection dropped on the reply); adding again would count a
        // whole batch twice.
        if ((error as { code?: string }).code !== 'P2002') throw error;
        await db.abStat.update({ where, data: increment });
      }
      if (p.clicks > 0) counted.add(p.testId);
    } catch (error) {
      // The database is out of reach: the counts wait for the next flush
      // instead of being lost. Bounded — keys are variant × hour.
      if (pendingHits.size < 10_000) addPending(p.testId, p.variantId, p.hour, p.clicks, p.visitors);
      console.error('[dvfly] contagem do teste A|B adiada:', error instanceof Error ? error.message : error);
    }
  }
  for (const [testId, at] of last) {
    try {
      await db.abTest.updateMany({ where: { id: testId, OR: [{ lastHitAt: null }, { lastHitAt: { lt: at } }] }, data: { lastHitAt: at } });
    } catch {
      if (!pendingLast.has(testId)) pendingLast.set(testId, at);
    }
  }
  if (pendingHits.size > 0 || pendingLast.size > 0) scheduleFlush();
  // Not awaited: pausing talks to Shopify, and the counts must not wait on it.
  for (const testId of counted) scheduleGoalCheck(testId);
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushHits();
  }, FLUSH_MS);
  flushTimer.unref?.();
}

/**
 * Writes the counts still in memory. The report calls it before reading, so
 * the screen always shows every arrival so far; flushes never overlap.
 */
export function flushHits(): Promise<void> {
  flushChain = flushChain.then(writePending, writePending);
  return flushChain;
}

// A restart (a new version going up) writes what is still in memory first.
// Whoever else listens (server.mjs closes the HTTP server) decides when the
// process ends; alone, this listener would swallow the signal, so it exits
// itself once the counts are written.
const hooked = globalThis as { __dvflyAbFlushHook?: boolean };
if (!hooked.__dvflyAbFlushHook) {
  hooked.__dvflyAbFlushHook = true;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      const others = process.listenerCount(signal);
      void flushHits().finally(() => {
        if (others === 0) process.exit(0);
      });
    });
  }
}

// ---- click goal ---------------------------------------------------------------

/** Every click the test has, all versions, all its time live. */
export async function totalClicks(testId: string): Promise<number> {
  const sum = await db.abStat.aggregate({ where: { testId }, _sum: { clicks: true } });
  return sum._sum.clicks ?? 0;
}

/**
 * A test with a click goal pauses itself once its clicks (all versions
 * together) reach it — the same pause as the button: the entry gets its own
 * page back, the versions their canonical, and every number stays. Checked
 * after the counts that reached the database, at most every GOAL_CHECK_MS per
 * test (with a trailing check, so the last arrivals are never left out), and
 * again whenever the test's screen or the list opens.
 */
const GOAL_CHECK_MS = 2_000;
const goalLastCheck = new Map<string, number>();
const goalTimers = new Map<string, ReturnType<typeof setTimeout>>();
const goalRunning = new Map<string, Promise<boolean>>();

function scheduleGoalCheck(testId: string): void {
  if (goalTimers.has(testId)) return;
  const wait = Math.max(0, (goalLastCheck.get(testId) ?? 0) + GOAL_CHECK_MS - Date.now());
  const timer = setTimeout(() => {
    goalTimers.delete(testId);
    void checkClickGoal(testId);
  }, wait);
  timer.unref?.();
  goalTimers.set(testId, timer);
}

/** True when this call (or one already running) paused the test on its goal. */
export function checkClickGoal(testId: string): Promise<boolean> {
  const running = goalRunning.get(testId);
  if (running) return running;
  goalLastCheck.set(testId, Date.now());
  const run = (async () => {
    try {
      const test = await db.abTest.findUnique({ where: { id: testId }, include: { variants: true, store: true } });
      if (!test || test.status !== 'live' || !test.clickGoal) return false;
      if ((await totalClicks(testId)) < test.clickGoal) return false;
      const { store, ...rest } = test;
      try {
        const { canonicalError } = await pause(rest, store);
        // Paused all the same; what did not come back is said on the screen.
        if (canonicalError) await rememberApplyError(testId, new Error(`o canonical das versões não voltou ao normal (${canonicalError})`));
      } catch (error) {
        // Still live, still counting: the next arrival or screen tries again,
        // and the screen says why it has not stopped yet.
        await rememberApplyError(testId, new Error(`chegou à meta de cliques, mas a pausa não chegou à loja (${errorText(error)})`));
        return false;
      }
      await db.abTest.update({ where: { id: testId }, data: { goalReachedAt: new Date() } });
      return true;
    } catch (error) {
      console.error('[dvfly] meta de cliques do teste A|B não conferida:', errorText(error));
      return false;
    } finally {
      goalRunning.delete(testId);
    }
  })();
  goalRunning.set(testId, run);
  return run;
}

/** One arrival through a test URL. Unknown or stopped tests are ignored, quietly. */
export async function recordHit(input: {
  testId: string;
  variantId: string;
  first: boolean;
  userAgent: string;
  ip: string;
}): Promise<HitOutcome> {
  if (BOT.test(input.userAgent)) return 'bot';
  if (overLimit(input.ip)) return 'limited';
  const variant = await variantInfo(input.variantId);
  if (!variant || variant.testId !== input.testId) return 'unknown';
  if (!variant.live) return 'not-live';
  const now = new Date();
  addPending(input.testId, input.variantId, new Date(Math.floor(now.getTime() / 3600_000) * 3600_000), 1, input.first ? 1 : 0);
  pendingLast.set(input.testId, now);
  if (WRITE_THROUGH) await flushHits();
  else scheduleFlush();
  return 'counted';
}

// ---- orders -----------------------------------------------------------------

/** Read access reaches 60 days back; asking for more is refused by Shopify anyway. */
const ORDERS_HORIZON_MS = 60 * 24 * 3600_000;

/**
 * Brings the light copy of the store's orders up to date. Bounded per call
 * (2000 orders); `complete` false means the next load continues.
 */
export async function syncOrders(store: StoreRow): Promise<{ complete: boolean; read: number }> {
  const horizon = new Date(Date.now() - ORDERS_HORIZON_MS);
  // Ten minutes of overlap: an order written while the last sync ran is read again, not lost.
  const since = store.ordersSyncedTo ? new Date(store.ordersSyncedTo.getTime() - 10 * 60_000) : horizon;
  const startedAt = new Date();
  const result = await ordersUpdatedSince(clientFor(store), since < horizon ? horizon : since);
  for (let i = 0; i < result.orders.length; i += 100) {
    await db.$transaction(
      result.orders.slice(i, i + 100).map((o) => {
        const row = {
          storeId: store.id,
          createdAt: new Date(o.createdAt),
          cancelled: o.cancelled,
          test: o.test,
          total: o.total,
          currency: o.currency,
          productIds: o.productIds.join(' '),
        };
        return db.abOrder.upsert({ where: { id: o.id }, create: { id: o.id, ...row }, update: row });
      }),
    );
  }
  await db.store.update({
    where: { id: store.id },
    data: { ordersSyncedTo: result.complete ? startedAt : result.resumeFrom },
  });
  return { complete: result.complete, read: result.orders.length };
}

// ---- report -----------------------------------------------------------------

export interface VariantRow {
  id: string;
  title: string;
  handle: string;
  weight: number;
  clicks: number;
  visitors: number;
  orders: number;
  cancelled: number;
  revenue: number;
}

export interface Report {
  timezone: string;
  from: string;
  to: string;
  /** Orders count from here: the later of the period's start and the test's. */
  countFrom: string;
  /** The test was paused at some point inside the period: orders then do not count. */
  pausedInside: boolean;
  rows: VariantRow[];
  days: Array<{ day: string; byVariant: Record<string, { clicks: number; orders: number }> }>;
  currency: string | null;
  verdict: ReturnType<typeof verdict>;
  /** Why orders are missing or partial, in the screen's words; null when complete. */
  ordersNote: string | null;
  ordersOk: boolean;
  /**
   * How many more clicks until the test can tell — on the WHOLE test, not
   * the period — with the pace it is measured against (null when not live)
   * and, when the whole test is already decided, what it decided.
   */
  estimate: (Estimate & { clicksPerDay: number | null; since: string; wholeNote: string }) | null;
}

/**
 * The store's timezone and public address, remembered per process (neither
 * changes under a running test). Out of reach: UTC and the myshopify domain.
 */
const infos = new Map<string, { timezone: string; url: string }>();
export async function storeInfo(store: StoreRow): Promise<{ timezone: string; url: string }> {
  const known = infos.get(store.id);
  if (known) return known;
  try {
    const info = await shopInfo(clientFor(store));
    const value = { timezone: info.timezone, url: (info.url ?? `https://${store.domain}`).replace(/\/$/, '') };
    infos.set(store.id, value);
    return value;
  } catch {
    return { timezone: 'UTC', url: `https://${store.domain}` };
  }
}

/** Orders of the test's products, created in [from, to) while the test was live; test orders left out. */
async function testOrders(storeId: string, from: Date, to: Date, spans: Span[]) {
  const orders = await db.abOrder.findMany({
    where: { storeId, test: false, createdAt: { gte: from, lt: to } },
    select: { createdAt: true, cancelled: true, total: true, currency: true, productIds: true },
  });
  return orders.filter((o) => inSpans(spans, o.createdAt));
}

const hourOf = (d: Date) => new Date(Math.floor(d.getTime() / 3600_000) * 3600_000);
/** Below this much live time, a pace is a guess: no days are estimated from it. */
const MIN_PACE_MS = 10 * 60_000;

/**
 * The whole test's clicks and orders per variant (the estimate's input — a
 * period chosen on screen is not the test), with each one's current weight,
 * and the pace of clicks over the last 7 days of LIVE time (paused days are
 * not slow days). No pace while the test is not live.
 */
async function wholeTest(test: TestWithVariants, store: StoreRow, spans: Span[]) {
  const now = new Date();
  const first = spans[0]?.[0] ?? test.startedAt ?? now;
  const byProduct = new Map(test.variants.map((v) => [v.productGid, v.id]));
  const clicks = new Map(test.variants.map((v) => [v.id, 0]));
  const orders = new Map(test.variants.map((v) => [v.id, 0]));
  const sums = await db.abStat.groupBy({
    by: ['variantId'],
    where: { testId: test.id, hour: { gte: hourOf(first) } },
    _sum: { clicks: true },
  });
  for (const row of sums) if (clicks.has(row.variantId)) clicks.set(row.variantId, row._sum.clicks ?? 0);
  for (const order of await testOrders(store.id, first, now, spans)) {
    if (order.cancelled) continue;
    for (const productId of order.productIds.split(' ')) {
      const variantId = byProduct.get(productId);
      if (variantId) orders.set(variantId, (orders.get(variantId) ?? 0) + 1);
    }
  }
  let clicksPerDay: number | null = null;
  if (test.status === 'live') {
    const windowStart = hourOf(new Date(now.getTime() - 7 * 86400_000));
    const live = liveMs(spans, windowStart, now);
    if (live >= MIN_PACE_MS) {
      const recent = await db.abStat.aggregate({ where: { testId: test.id, hour: { gte: windowStart } }, _sum: { clicks: true } });
      clicksPerDay = ((recent._sum.clicks ?? 0) * 86400_000) / live;
    }
  }
  return {
    first,
    rows: ordered(test).map((v) => ({ id: v.id, clicks: clicks.get(v.id) ?? 0, orders: orders.get(v.id) ?? 0, weight: v.weight })),
    clicksPerDay,
  };
}

export async function buildReport(test: TestWithVariants, store: StoreRow, from: string, to: string): Promise<Report> {
  // Arrivals still in memory belong on the screen too.
  await flushHits();
  const { timezone } = await storeInfo(store);
  const start = dayStart(from, timezone);
  const end = dayStart(addDays(to, 1), timezone);
  const spans = spansOf(test);
  // An order placed before the test existed is not an order of the test,
  // even when the period on screen reaches further back.
  const countFrom = test.startedAt && test.startedAt > start ? test.startedAt : start;
  const until = end.getTime() < Date.now() ? end : new Date();
  // Any pause counts, however short: an order placed in it was left out.
  // (The second only absorbs clock rounding between old rows' fields.)
  const pausedInside = until > countFrom && liveMs(spans, countFrom, until) < until.getTime() - countFrom.getTime() - 1000;
  const variants = ordered(test);
  const days = daysBetween(from, to);
  const blank = () => Object.fromEntries(variants.map((v) => [v.id, { clicks: 0, orders: 0 }]));
  const byDay = new Map(days.map((day) => [day, blank()]));
  const rows = new Map<string, VariantRow>(
    variants.map((v) => [
      v.id,
      { id: v.id, title: v.title, handle: v.handle, weight: v.weight, clicks: 0, visitors: 0, orders: 0, cancelled: 0, revenue: 0 },
    ]),
  );

  const stats = await db.abStat.findMany({ where: { testId: test.id, hour: { gte: start, lt: end } } });
  for (const s of stats) {
    const row = rows.get(s.variantId);
    if (!row) continue;
    row.clicks += s.clicks;
    row.visitors += s.visitors;
    const cell = byDay.get(localDay(s.hour, timezone))?.[s.variantId];
    if (cell) cell.clicks += s.clicks;
  }

  let ordersNote: string | null = null;
  let ordersOk = true;
  try {
    const sync = await syncOrders(store);
    if (!sync.complete) ordersNote = 'Ainda copiando os pedidos da loja: os números de pedidos podem subir ao recarregar.';
  } catch (error) {
    ordersOk = false;
    ordersNote = errorText(error);
  }

  const byProduct = new Map(variants.map((v) => [v.productGid, v.id]));
  let currency: string | null = null;
  for (const order of await testOrders(store.id, countFrom, end, spans)) {
    for (const productId of order.productIds.split(' ')) {
      const variantId = byProduct.get(productId);
      if (!variantId) continue;
      const row = rows.get(variantId)!;
      if (order.cancelled) {
        row.cancelled++;
        continue;
      }
      currency ??= order.currency;
      row.orders++;
      row.revenue += order.total;
      const cell = byDay.get(localDay(order.createdAt, timezone))?.[variantId];
      if (cell) cell.orders++;
    }
  }

  const list = variants.map((v) => rows.get(v.id)!);
  const labels = Object.fromEntries(list.map((r, i) => [r.id, `A versão ${letterOf(i)}`]));
  let estimated: Report['estimate'] = null;
  if (spans.length > 0 && ordersOk) {
    const whole = await wholeTest(test, store, spans);
    estimated = {
      ...estimate(whole.rows, whole.clicksPerDay),
      clicksPerDay: whole.clicksPerDay,
      since: whole.first.toISOString(),
      wholeNote: verdict(whole.rows, labels).note,
    };
  }
  return {
    timezone,
    from,
    to,
    countFrom: countFrom.toISOString(),
    pausedInside,
    rows: list,
    days: days.map((day) => ({ day, byVariant: byDay.get(day)! })),
    currency,
    verdict: verdict(list, labels),
    ordersNote,
    ordersOk,
    estimate: estimated,
  };
}

// ---- health -----------------------------------------------------------------

export interface Health {
  /** Pages a visitor can be sent to that would not open, said per page. */
  problems: Array<{ label: string; handle: string; problem: string; receives: boolean }>;
  /** Pages Shopify gave no storefront URL for: unpublished, or a store with a password. */
  doubts: Array<{ label: string; handle: string; doubt: string }>;
  /** Products whose URL changed in the admin since the test was applied. */
  renamed: Array<{ label: string; was: string; now: string }>;
  /** Where each other version's canonical points (the entry has its own). */
  canonical: Array<{ label: string; handle: string; state: CanonicalState }>;
  /** The products could not be read from the store. */
  productsError: string | null;
  /** The canonical check could not be done (the product check may have worked). */
  canonicalError: string | null;
  /** The test reports clicks to another address than this app's. */
  trackerMismatch: { recorded: string; current: string } | null;
  /** Minutes since the last click, null when none ever; approximate when only the hour is known. */
  lastHitMinutes: number | null;
  lastHitApprox: boolean;
  /** Settings saved that the store is not running yet (the last write failed). */
  applyError: string | null;
  /** What was observed about version A's page at the last write. */
  modeNote: string | null;
  /** Version A on its own page, and its original template or layout changed since the copy. */
  copyChanged: boolean | null;
  /** Minutes since the current live stretch began; days live in all, pauses left out. */
  liveSinceMinutes: number | null;
  liveDays: number;
}

/** Days a test has been live in all, its pauses left out (the list and the reminder use it). */
export function liveDaysOf(test: AbTest, now = new Date()): number {
  return Math.floor(liveMs(spansOf(test), new Date(0), now) / 86400_000);
}

/**
 * What could be silently wrong with a live test, read from the store each
 * time the screen opens: a page that would not open, a URL renamed in the
 * admin, a canonical that is not pointing at the entry, clicks reported to
 * an address that is not this app, version A's copy behind its original,
 * settings that did not reach the store.
 */
export async function testHealth(test: TestWithVariants, store: StoreRow, origin: string): Promise<Health> {
  const now = new Date();
  const spans = spansOf(test);
  const sinceStretch = currentSpanStart(spans);
  let lastHit = test.lastHitAt;
  let lastHitApprox = false;
  if (!lastHit) {
    // Tests from before the last-click time existed: the latest hour with a click.
    const row = await db.abStat.findFirst({ where: { testId: test.id, clicks: { gt: 0 } }, orderBy: { hour: 'desc' }, select: { hour: true } });
    if (row) [lastHit, lastHitApprox] = [row.hour, true];
  }
  const health: Health = {
    problems: [],
    doubts: [],
    renamed: [],
    canonical: [],
    productsError: null,
    canonicalError: null,
    trackerMismatch: test.trackerOrigin && test.trackerOrigin !== origin ? { recorded: test.trackerOrigin, current: origin } : null,
    lastHitMinutes: lastHit ? Math.max(0, Math.floor((now.getTime() - lastHit.getTime()) / 60_000)) : null,
    lastHitApprox,
    applyError: test.applyError,
    modeNote: test.entryModeNote,
    copyChanged: null,
    liveSinceMinutes: sinceStretch ? Math.floor((now.getTime() - sinceStretch.getTime()) / 60_000) : null,
    liveDays: liveDaysOf(test, now),
  };
  const variants = ordered(test);
  const pages = [
    { label: 'URL de entrada', productGid: test.entryProductGid, handle: test.entryHandle, receives: true },
    ...variants
      .map((v, i) => ({ label: `Versão ${letterOf(i)}`, productGid: v.productGid, handle: v.handle, receives: v.weight > 0 }))
      .filter((p) => p.productGid !== test.entryProductGid),
  ];
  const client = clientFor(store);
  let states: Map<string, ProductState | null>;
  try {
    states = await productStates(client, pages.map((p) => p.productGid));
  } catch (error) {
    health.productsError = errorText(error);
    return health;
  }
  for (const page of pages) {
    const state = states.get(page.productGid) ?? null;
    const problem = unreachableReason(state);
    const doubt = publicationDoubt(state);
    if (problem) health.problems.push({ label: page.label, handle: page.handle, problem, receives: page.receives });
    else if (doubt) health.doubts.push({ label: page.label, handle: page.handle, doubt });
    if (!problem && state && state.handle !== page.handle) health.renamed.push({ label: page.label, was: page.handle, now: state.handle });
  }
  const others = pages.slice(1).filter((p) => states.get(p.productGid));
  try {
    const canonical = await inspectVariantCanonicals(
      client,
      test.entryHandle,
      others.map((p) => {
        const state = states.get(p.productGid)!;
        return { id: p.productGid, templateSuffix: state.templateSuffix, abEntry: state.abEntry };
      }),
    );
    health.canonical = others.map((p) => ({ label: p.label, handle: p.handle, state: canonical.get(p.productGid) ?? 'unset' }));
  } catch (error) {
    health.canonicalError = errorText(error);
  }
  if (test.entryMode === 'stay') {
    try {
      health.copyChanged = await entryCopyChanged(client, test.id, test.previousSuffix);
    } catch {
      health.copyChanged = null;
    }
  }
  return health;
}
