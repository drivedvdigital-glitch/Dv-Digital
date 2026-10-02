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

/** Conversion as the screen shows it: "2,4%" (or "—" with no clicks). */
export function percent(part: number, whole: number): string {
  if (whole <= 0) return '—';
  return `${((part / whole) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
