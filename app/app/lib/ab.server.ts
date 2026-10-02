/**
 * "Teste A | B" on the server: putting a test live and taking it down on the
 * store, counting arrivals, keeping the light copy of orders, and the report.
 *
 * The storefront half is `packages/shopify/src/split.ts`; the arithmetic is
 * `ab.ts`. This file is the glue, and the one place that knows both.
 */
import type { AbTest, AbVariant, Store as StoreRow } from '@prisma/client';

import { ordersUpdatedSince, shopInfo } from '../../../packages/shopify/src/orders.ts';
import { productTemplateSuffix, setProductTemplate } from '../../../packages/shopify/src/products.ts';
import { ensureSplitTemplate, removeSplitTemplate, splitSuffix } from '../../../packages/shopify/src/split.ts';

import { addDays, dayStart, daysBetween, localDay, verdict } from './ab.ts';
import { db } from './db.server.ts';
import { clientFor } from './shopify.server.ts';

export const HIT_PATH = '/ab/hit';

type TestWithVariants = AbTest & { variants: AbVariant[] };

const ordered = (test: TestWithVariants) => [...test.variants].sort((a, b) => a.position - b.position);

/**
 * Puts the test on the store (or rewrites it after an edit): theme files,
 * then the entry product pointed at them. The entry product's own template
 * is remembered the first time, so pausing can give it back.
 */
export async function goLive(test: TestWithVariants, store: StoreRow, origin: string): Promise<void> {
  const client = clientFor(store);
  const suffix = splitSuffix(test.id);
  const current = await productTemplateSuffix(client, test.entryProductGid);
  if (current === undefined) {
    throw new Error(`O produto de entrada (${test.entryHandle}) não existe mais em ${store.label}.`);
  }
  await ensureSplitTemplate(client, {
    testId: test.id,
    name: test.name,
    hitUrl: new URL(HIT_PATH, origin).href,
    variants: ordered(test).map((v) => ({ id: v.id, handle: v.handle, weight: v.weight })),
  });
  // Only a suffix that is not ours is worth remembering: re-applying a live
  // test must not overwrite the original with our own.
  const previousSuffix = current === suffix ? test.previousSuffix : current;
  await setProductTemplate(client, test.entryProductGid, suffix);
  await db.abTest.update({
    where: { id: test.id },
    data: { status: 'live', trackerOrigin: origin, previousSuffix, startedAt: test.startedAt ?? new Date() },
  });
  // From here on, orders matter: sync from the start of the test.
  if (!store.ordersSyncedTo) {
    await db.store.update({ where: { id: store.id }, data: { ordersSyncedTo: new Date(Date.now() - 24 * 3600_000) } });
  }
}

/**
 * Gives the entry product back the template it had — only if it still points
 * at ours (a merchant who moved it meanwhile keeps their choice). The theme
 * files stay: resuming is one click and rewrites them anyway.
 */
export async function pause(test: TestWithVariants, store: StoreRow): Promise<{ restored: boolean }> {
  const client = clientFor(store);
  const current = await productTemplateSuffix(client, test.entryProductGid);
  let restored = false;
  if (current === splitSuffix(test.id)) {
    await setProductTemplate(client, test.entryProductGid, test.previousSuffix ?? null);
    restored = true;
  }
  await db.abTest.update({ where: { id: test.id }, data: { status: 'paused' } });
  return { restored };
}

/** Pause (when live) and take the files out of the theme; the caller deletes the row. */
export async function takeDown(test: TestWithVariants, store: StoreRow): Promise<void> {
  if (test.status === 'live') await pause(test, store);
  if (test.status !== 'draft') await removeSplitTemplate(clientFor(store), test.id);
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
  const variant = await db.abVariant.findUnique({
    where: { id: input.variantId },
    select: { testId: true, test: { select: { status: true } } },
  });
  if (!variant || variant.testId !== input.testId) return 'unknown';
  if (variant.test.status !== 'live') return 'not-live';
  const hour = new Date(Math.floor(Date.now() / 3600_000) * 3600_000);
  const where = { variantId_hour: { variantId: input.variantId, hour } };
  const increment = { clicks: { increment: 1 }, visitors: { increment: input.first ? 1 : 0 } };
  try {
    await db.abStat.upsert({
      where,
      create: { variantId: input.variantId, testId: input.testId, hour, clicks: 1, visitors: input.first ? 1 : 0 },
      update: increment,
    });
  } catch {
    // Two arrivals creating the same hour at once: the loser updates.
    await db.abStat.update({ where, data: increment });
  }
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
  rows: VariantRow[];
  days: Array<{ day: string; byVariant: Record<string, { clicks: number; orders: number }> }>;
  currency: string | null;
  verdict: ReturnType<typeof verdict>;
  /** Why orders are missing or partial, in the screen's words; null when complete. */
  ordersNote: string | null;
  ordersOk: boolean;
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

export async function buildReport(test: TestWithVariants, store: StoreRow, from: string, to: string): Promise<Report> {
  const { timezone } = await storeInfo(store);
  const start = dayStart(from, timezone);
  const end = dayStart(addDays(to, 1), timezone);
  // An order placed before the test existed is not an order of the test,
  // even when the period on screen reaches further back.
  const countFrom = test.startedAt && test.startedAt > start ? test.startedAt : start;
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
    ordersNote = error instanceof Error ? error.message : String(error);
  }

  const byProduct = new Map(variants.map((v) => [v.productGid, v.id]));
  const orders = await db.abOrder.findMany({
    where: { storeId: store.id, test: false, createdAt: { gte: countFrom, lt: end } },
    select: { createdAt: true, cancelled: true, total: true, currency: true, productIds: true },
  });
  let currency: string | null = null;
  for (const order of orders) {
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
  return {
    timezone,
    from,
    to,
    countFrom: countFrom.toISOString(),
    rows: list,
    days: days.map((day) => ({ day, byVariant: byDay.get(day)! })),
    currency,
    verdict: verdict(list, Object.fromEntries(list.map((r, i) => [r.id, `Versão ${i + 1}`]))),
    ordersNote,
    ordersOk,
  };
}
