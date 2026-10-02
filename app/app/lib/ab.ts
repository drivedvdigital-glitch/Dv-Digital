/**
 * The arithmetic of the A/B report, with no database and no Shopify — what
 * the screen and the server both need, and what the tests pin down.
 *
 * Days are the STORE's days: an order at 22:00 in Bogotá is that day's order,
 * not the next day's in UTC. Arrivals are stored per UTC hour and folded into
 * store days here (exact for every whole-hour timezone, which is every
 * timezone a Shopify store in the Americas or Europe uses).
 */

export const AB_MIN_VARIANTS = 2;
export const AB_MAX_VARIANTS = 6;
/** The highest click goal a test takes (a typo guard, not a business rule). */
export const AB_MAX_CLICK_GOAL = 100_000_000;
/**
 * A test live for this long gets a reminder to decide: Google asks that a
 * test not run indefinitely (a variant left up for good starts to look like
 * an attempt to show search one thing and people another).
 */
export const AB_LONG_TEST_DAYS = 30;

/** Statuses as stored, and how the screen says them. */
export const AB_STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  live: 'No ar',
  paused: 'Pausado',
  ended: 'Encerrado',
};

/** Offset of `tz` from UTC at `date`, in ms (positive east of Greenwich). */
function offsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** `YYYY-MM-DD` of `date` in `tz`. */
export function localDay(date: Date, tz: string): string {
  return new Date(date.getTime() + offsetMs(date, tz)).toISOString().slice(0, 10);
}

/** A moment as the clock in `tz` reads it: `YYYY-MM-DDTHH:mm` (what `<input type="datetime-local">` holds). */
export function localDateTime(date: Date, tz: string): string {
  return new Date(date.getTime() + offsetMs(date, tz)).toISOString().slice(0, 16);
}

/** The shape of a `datetime-local` value. */
export const DATETIME_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** The UTC instant the clock in `tz` reads as `local` (`YYYY-MM-DDTHH:mm`). */
export function zonedToUtc(local: string, tz: string): Date {
  const [day, time] = local.split('T');
  const [y, m, d] = day.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  // Twice, as in dayStart: the offset may change between guess and answer.
  let t = guess - offsetMs(new Date(guess), tz);
  t = guess - offsetMs(new Date(t), tz);
  return new Date(t);
}

/** The UTC instant at which `day` (`YYYY-MM-DD`) starts in `tz`. */
export function dayStart(day: string, tz: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  // Twice: the offset at the guess may differ from the offset at the answer
  // (a daylight-saving change on that night).
  let t = guess - offsetMs(new Date(guess), tz);
  t = guess - offsetMs(new Date(t), tz);
  return new Date(t);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Every day from `from` to `to`, both included. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to && days.length < 400; day = addDays(day, 1)) days.push(day);
  return days;
}

export const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** Splits 100 as evenly as integers allow: 3 → 34, 33, 33. */
export function evenWeights(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(100 / n);
  return Array.from({ length: n }, (_, i) => base + (i < 100 - base * n ? 1 : 0));
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 via erf). */
function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/**
 * Two-sided p-value of "these two conversion rates are the same" (two
 * proportions, pooled). 1 when there is nothing to compare.
 */
export function pValue(conv1: number, n1: number, conv2: number, n2: number): number {
  if (n1 <= 0 || n2 <= 0) return 1;
  const pooled = (conv1 + conv2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0) return 1;
  const z = (conv1 / n1 - conv2 / n2) / se;
  return 2 * (1 - normalCdf(Math.abs(z)));
}

export interface VariantResult {
  id: string;
  clicks: number;
  orders: number;
}

export interface Verdict {
  /** Highest conversion so far (null with no clicks anywhere). */
  leaderId: string | null;
  /** The leader beats EVERY other variant at 95%. */
  confident: boolean;
  /** One sentence for the screen. */
  note: string;
}

/**
 * Who is ahead, and whether it is more than luck. The lesson paid with the
 * PageSpeed scores applies here too: one number from a small sample swings by
 * itself, and picking a winner on noise is how a good page gets thrown away.
 */
export function verdict(rows: VariantResult[], labels: Record<string, string> = {}): Verdict {
  const live = rows.filter((r) => r.clicks > 0);
  if (live.length < 2) {
    return { leaderId: live[0]?.id ?? null, confident: false, note: 'Ainda sem cliques suficientes para comparar as versões.' };
  }
  const rate = (r: VariantResult) => r.orders / r.clicks;
  const sorted = [...live].sort((a, b) => rate(b) - rate(a) || b.orders - a.orders);
  const leader = sorted[0];
  const name = labels[leader.id] ?? 'A líder';
  const totalOrders = live.reduce((s, r) => s + r.orders, 0);
  if (totalOrders === 0) {
    return { leaderId: null, confident: false, note: 'Nenhum pedido no período: ainda não dá para comparar.' };
  }
  // The normal approximation behind the p-value only holds with enough
  // orders: about 5 expected on each side (the textbook rule). Below that a
  // 2-against-0 reads as "95% sure" and means nothing.
  const enough = (r: VariantResult) => {
    const pooled = (leader.orders + r.orders) / (leader.clicks + r.clicks);
    return pooled * leader.clicks >= 5 && pooled * r.clicks >= 5;
  };
  if (!sorted.slice(1).every(enough)) {
    return {
      leaderId: leader.id,
      confident: false,
      note:
        `${name} está na frente, mas com tão poucos pedidos a diferença ainda cabe no acaso ` +
        '(para comparar, cada versão precisa de uns 5 pedidos esperados). Deixe rodar mais.',
    };
  }
  const worst = Math.max(...sorted.slice(1).map((r) => pValue(leader.orders, leader.clicks, r.orders, r.clicks)));
  if (worst < 0.05) {
    return { leaderId: leader.id, confident: true, note: `${name} converte mais que todas as outras, com 95% de confiança.` };
  }
  return {
    leaderId: leader.id,
    confident: false,
    note:
      `${name} está na frente, mas a diferença ainda cabe no acaso ` +
      `(confiança de ${Math.max(0, Math.round((1 - worst) * 100))}% contra a segunda; o mínimo é 95%). Deixe rodar mais.`,
  };
}

/** z for 95% confidence, two-sided — the bar `verdict` uses. */
const Z_CONFIDENCE = 1.959964;
/** z for 80% power: the chance of seeing a difference that is really there. */
const Z_POWER = 0.841621;
/** Beyond this many days at the current pace, waiting is not a plan. */
export const ESTIMATE_MAX_DAYS = 60;
/** Below this many orders in the whole test, an estimate would be a guess. */
export const ESTIMATE_MIN_ORDERS = 3;
/**
 * A gap under this fraction of the leader's rate is "the versions sell about
 * the same" (2,0% against 2,1% is 5%); above it, a long wait means too little
 * traffic, not too little difference.
 */
export const SMALL_DIFFERENCE = 0.2;

export interface Estimate {
  /**
   * "remaining": N more clicks would settle it; "too-slow": they would take
   * more than ESTIMATE_MAX_DAYS at the current pace; "never": no number of
   * clicks settles it, because the closest rival gets no more visitors (0%);
   * "near": the clicks should already be enough at the rates seen; "equal":
   * no difference to measure; "no-data": too few orders; "no-clicks": fewer
   * than two versions with clicks; "mismatch": a version has more orders than
   * clicks (orders from outside the test, or a count that stopped), so the
   * rates mean nothing; "done": the whole test is already confident.
   */
  kind: 'remaining' | 'too-slow' | 'never' | 'near' | 'equal' | 'no-data' | 'no-clicks' | 'mismatch' | 'done';
  /** More clicks needed, all versions together (remaining / too-slow / near). */
  clicks: number | null;
  /** At the current pace; null when there is no pace to go by (paused, no clicks). */
  days: number | null;
  /** The two versions the estimate is about (leader, deciding rival); for "mismatch", rivalId is the odd version. */
  leaderId: string | null;
  rivalId: string | null;
  /** Their conversion rates so far (0–1). */
  leaderRate: number | null;
  rivalRate: number | null;
  /** Leader and rival differ by less than SMALL_DIFFERENCE of the leader's rate. */
  small: boolean;
  /** EVERY version with clicks is that close to the leader: any of them would do. */
  allClose: boolean;
}

/** A version's numbers so far, and — when known — its share of the visitors from now on. */
export interface EstimateRow extends VariantResult {
  weight?: number;
}

/** Ceiling for the extra clicks searched: beyond this, "never". */
const CLICKS_CAP = 1e10;

/**
 * Extra clicks (all versions together) until a test of `leader` against
 * `rival` reaches 95% confidence with 80% power, if their conversion rates are
 * what they look like now and each version gets `share` of the clicks from
 * here on. Two proportions, normal approximation — the model of `pValue` —
 * plus the floor `verdict` needs before it trusts that model (about 5
 * expected orders on each side). Searched, not solved: a version at 0% keeps
 * its numbers frozen, and then the answer can be "never" (Infinity).
 */
function extraClicks(leader: VariantResult, rival: VariantResult, shareL: number, shareR: number): number {
  const pL = leader.orders / leader.clicks;
  const pR = rival.orders / rival.clicks;
  const gap = pL - pR;
  const pooled = (leader.orders + rival.orders) / (leader.clicks + rival.clicks);
  const enough = (more: number) => {
    const nL = leader.clicks + shareL * more;
    const nR = rival.clicks + shareR * more;
    const a = Math.sqrt(pooled * (1 - pooled) * (1 / nL + 1 / nR));
    const b = Math.sqrt((pL * (1 - pL)) / nL + (pR * (1 - pR)) / nR);
    return Z_CONFIDENCE * a + Z_POWER * b <= gap && pooled * nL >= 5 && pooled * nR >= 5;
  };
  if (enough(0)) return 0;
  if (!enough(CLICKS_CAP)) return Infinity;
  let lo = 0;
  let hi = CLICKS_CAP;
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2;
    if (enough(mid)) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi);
}

/**
 * How many more clicks until the test can say whether the leader really is
 * better — or that it never will, at a reasonable pace, because the versions
 * convert almost alike or the traffic is thin. `rows` are the whole test's
 * numbers (not one period's), with each version's current weight when known
 * (a version at 0% gets nobody from now on); `clicksPerDay` is the recent
 * pace while live (null when there is none, e.g. paused).
 *
 * An ESTIMATE from the rates seen so far, which move as orders come in: the
 * screen says so, and rounds what it shows.
 */
export function estimate(rows: EstimateRow[], clicksPerDay: number | null): Estimate {
  const blank = {
    clicks: null,
    days: null,
    leaderId: null,
    rivalId: null,
    leaderRate: null,
    rivalRate: null,
    small: false,
    allClose: false,
  };
  // An order counts by product, a click only through the test URL: more
  // orders than clicks means the rates are not rates.
  const odd = rows.find((r) => r.orders > r.clicks);
  if (odd) return { kind: 'mismatch', ...blank, rivalId: odd.id };
  if (verdict(rows).confident) return { kind: 'done', ...blank };
  const live = rows.filter((r) => r.clicks > 0);
  if (live.length < 2) return { kind: 'no-clicks', ...blank };
  if (live.reduce((s, r) => s + r.orders, 0) < ESTIMATE_MIN_ORDERS) return { kind: 'no-data', ...blank };
  const total = live.reduce((s, r) => s + r.clicks, 0);
  const weighted = rows.every((r) => typeof r.weight === 'number') && rows.some((r) => (r.weight ?? 0) > 0);
  const weightSum = rows.reduce((s, r) => s + (r.weight ?? 0), 0);
  const share = (r: EstimateRow) => (weighted ? (r.weight ?? 0) / weightSum : r.clicks / total);
  const rate = (r: VariantResult) => r.orders / r.clicks;
  const [leader, ...rest] = [...live].sort((a, b) => rate(b) - rate(a) || b.orders - a.orders);
  const close = (r: VariantResult) => rate(leader) === 0 || (rate(leader) - rate(r)) / rate(leader) < SMALL_DIFFERENCE;
  const allClose = rest.every(close);
  const tie = rest.find((r) => rate(r) === rate(leader));
  if (tie) {
    return { kind: 'equal', ...blank, leaderId: leader.id, rivalId: tie.id, leaderRate: rate(leader), rivalRate: rate(tie), small: true, allClose };
  }
  // The leader has to beat EVERY other version, so the one that needs the
  // most clicks is the one that decides.
  let rival = rest[0];
  let more = -1;
  for (const r of rest) {
    const n = extraClicks(leader, r, share(leader), share(r));
    if (n > more) [more, rival] = [n, r];
  }
  const pair = {
    leaderId: leader.id,
    rivalId: rival.id,
    leaderRate: rate(leader),
    rivalRate: rate(rival),
    small: close(rival),
    allClose,
  };
  if (more === Infinity) return { kind: 'never', ...blank, ...pair };
  if (more <= 0) return { kind: 'near', ...blank, ...pair, clicks: 0 };
  const days = clicksPerDay && clicksPerDay > 0 ? more / clicksPerDay : null;
  return { kind: days !== null && days > ESTIMATE_MAX_DAYS ? 'too-slow' : 'remaining', clicks: more, days, ...pair };
}

// ---- live periods -------------------------------------------------------------

/**
 * A stretch of time the test was live: [start, end), end null while it still
 * is. Clicks only accrue while live, so orders count only inside these too —
 * while paused the entry shows its own page to all the traffic, and its sales
 * are not the test's.
 */
export type Span = [Date, Date | null];

export function parseSpans(
  raw: string | null,
  fallback: { startedAt: Date | null; status: string; updatedAt: Date },
): Span[] {
  if (raw) {
    try {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        return list
          .filter((x): x is [string, string | null] => Array.isArray(x) && typeof x[0] === 'string')
          .map(([start, end]) => [new Date(start), end ? new Date(end) : null]);
      }
    } catch {
      // Unreadable: rebuilt from the start date below.
    }
  }
  if (!fallback.startedAt) return [];
  // Tests that went live before the periods were kept: one stretch from the
  // start, open while live, closed at the last change otherwise.
  return [[fallback.startedAt, fallback.status === 'live' ? null : fallback.updatedAt]];
}

export const serializeSpans = (spans: Span[]) =>
  JSON.stringify(spans.map(([start, end]) => [start.toISOString(), end ? end.toISOString() : null]));

/** A new stretch starts now, unless one is already open. */
export function openSpan(spans: Span[], now: Date): Span[] {
  const last = spans[spans.length - 1];
  return last && last[1] === null ? spans : [...spans, [now, null]];
}

/** The open stretch ends now. */
export function closeSpan(spans: Span[], now: Date): Span[] {
  const last = spans[spans.length - 1];
  return last && last[1] === null ? [...spans.slice(0, -1), [last[0], now]] : spans;
}

export const inSpans = (spans: Span[], at: Date) => spans.some(([start, end]) => start <= at && (end === null || at < end));

/** Live milliseconds inside [from, to). */
export function liveMs(spans: Span[], from: Date, to: Date): number {
  let total = 0;
  for (const [start, end] of spans) {
    const a = Math.max(start.getTime(), from.getTime());
    const b = Math.min((end ?? to).getTime(), to.getTime());
    if (b > a) total += b - a;
  }
  return total;
}

/** When the current stretch began (null when not live). */
export function currentSpanStart(spans: Span[]): Date | null {
  const last = spans[spans.length - 1];
  return last && last[1] === null ? last[0] : null;
}

/** A count as an estimate reads: two significant digits ("~3.400", "~250.000"). */
export function roughly(n: number): string {
  if (n < 100) return Math.ceil(n).toLocaleString('pt-BR');
  const step = 10 ** (Math.floor(Math.log10(n)) - 1);
  return (Math.ceil(n / step) * step).toLocaleString('pt-BR');
}

/** Conversion as the screen shows it: "2,4%" (or "—" with no clicks). */
export function percent(part: number, whole: number): string {
  if (whole <= 0) return '—';
  return `${((part / whole) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
