import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  addDays,
  closeSpan,
  currentSpanStart,
  dayStart,
  daysBetween,
  estimate,
  evenWeights,
  inSpans,
  liveMs,
  localDay,
  openSpan,
  parseSpans,
  pValue,
  roughly,
  serializeSpans,
  verdict,
  DATETIME_SHAPE,
  localDateTime,
  zonedToUtc,
} from '../app/lib/ab.ts';

describe('A/B report days', () => {
  it('counts days in the store timezone: 22:00 in Bogotá is still that day', () => {
    assert.equal(localDay(new Date('2026-10-02T03:00:00Z'), 'America/Bogota'), '2026-10-01');
    assert.equal(localDay(new Date('2026-10-02T05:00:00Z'), 'America/Bogota'), '2026-10-02');
    assert.equal(dayStart('2026-10-01', 'America/Bogota').toISOString(), '2026-10-01T05:00:00.000Z');
    assert.equal(dayStart('2026-10-01', 'Europe/Budapest').toISOString(), '2026-09-30T22:00:00.000Z');
    assert.equal(dayStart('2026-10-01', 'UTC').toISOString(), '2026-10-01T00:00:00.000Z');
  });

  it('survives the daylight-saving night', () => {
    // Budapest goes from +2 to +1 on 25/10/2026.
    assert.equal(dayStart('2026-10-26', 'Europe/Budapest').toISOString(), '2026-10-25T23:00:00.000Z');
  });

  it('walks day ranges', () => {
    assert.equal(addDays('2026-09-30', 1), '2026-10-01');
    assert.deepEqual(daysBetween('2026-09-29', '2026-10-01'), ['2026-09-29', '2026-09-30', '2026-10-01']);
  });
});

describe('A/B weights and verdict', () => {
  it('splits 100 evenly', () => {
    assert.deepEqual(evenWeights(4), [25, 25, 25, 25]);
    assert.deepEqual(evenWeights(3), [34, 33, 33]);
    assert.equal(evenWeights(6).reduce((a, b) => a + b, 0), 100);
  });

  it('p-value: same rate is 1; a large gap on large samples is tiny', () => {
    assert.ok(pValue(10, 1000, 10, 1000) > 0.99);
    assert.ok(pValue(60, 1000, 20, 1000) < 0.001);
  });

  it('calls a winner only beyond luck', () => {
    const noisy = verdict([
      { id: 'a', clicks: 100, orders: 3 },
      { id: 'b', clicks: 100, orders: 2 },
    ], { a: 'Versão 1' });
    assert.equal(noisy.leaderId, 'a');
    assert.equal(noisy.confident, false);
    assert.match(noisy.note, /Versão 1 está na frente.*acaso/);

    const clear = verdict([
      { id: 'a', clicks: 1000, orders: 60 },
      { id: 'b', clicks: 1000, orders: 20 },
      { id: 'c', clicks: 1000, orders: 25 },
    ]);
    assert.equal(clear.leaderId, 'a');
    assert.equal(clear.confident, true);
  });

  it('never calls a winner on a handful of orders (2 against 0 is not 95%)', () => {
    const tiny = verdict([
      { id: 'a', clicks: 14, orders: 2 },
      { id: 'b', clicks: 8, orders: 0 },
      { id: 'c', clicks: 9, orders: 0 },
    ]);
    assert.equal(tiny.confident, false);
    assert.match(tiny.note, /poucos pedidos/);
  });

  it('says so when there is nothing to compare', () => {
    assert.equal(verdict([{ id: 'a', clicks: 0, orders: 0 }, { id: 'b', clicks: 0, orders: 0 }]).leaderId, null);
    assert.match(verdict([{ id: 'a', clicks: 50, orders: 0 }, { id: 'b', clicks: 40, orders: 0 }]).note, /Nenhum pedido/);
  });
});

describe('A/B clicks still needed', () => {
  it('2% against 4%: about 1.300 more clicks, in days at the current pace', () => {
    const e = estimate(
      [
        { id: 'a', clicks: 500, orders: 10 },
        { id: 'b', clicks: 500, orders: 20 },
      ],
      500,
    );
    assert.equal(e.kind, 'remaining');
    assert.equal(e.leaderId, 'b');
    assert.equal(e.rivalId, 'a');
    assert.ok(e.clicks! > 1200 && e.clicks! < 1350, String(e.clicks));
    assert.ok(e.days! > 2.4 && e.days! < 2.7, String(e.days));
  });

  it('2,0% against 2,1%: too slow to show up, because the versions sell about the same', () => {
    const e = estimate(
      [
        { id: 'a', clicks: 5000, orders: 100 },
        { id: 'b', clicks: 5000, orders: 105 },
      ],
      1000,
    );
    assert.equal(e.kind, 'too-slow');
    assert.equal(e.small, true);
    assert.ok(e.clicks! > 500_000, String(e.clicks));
  });

  it('a big gap on little traffic is too slow for lack of traffic, not of difference', () => {
    const e = estimate([{ id: 'a', clicks: 10, orders: 4 }, { id: 'b', clicks: 10, orders: 0 }, { id: 'c', clicks: 10, orders: 1 }], 1);
    assert.equal(e.kind, 'too-slow');
    assert.equal(e.small, false);
    assert.equal(e.leaderRate, 0.4);
  });

  it('the rival that needs the most clicks is the one that decides', () => {
    const e = estimate(
      [
        { id: 'a', clicks: 1000, orders: 40 },
        { id: 'b', clicks: 1000, orders: 10 },
        { id: 'c', clicks: 1000, orders: 33 },
      ],
      300,
    );
    assert.equal(e.leaderId, 'a');
    assert.equal(e.rivalId, 'c');
  });

  it('uneven split: the small side is the bottleneck', () => {
    const even = estimate([{ id: 'a', clicks: 500, orders: 10 }, { id: 'b', clicks: 500, orders: 20 }], 0);
    const skewed = estimate([{ id: 'a', clicks: 900, orders: 18 }, { id: 'b', clicks: 100, orders: 4 }], 0);
    assert.ok(skewed.clicks! > even.clicks!, `${skewed.clicks} vs ${even.clicks}`);
    assert.equal(even.days, null);
  });

  it('a rival moved to 0% never gets more clicks: "never" when its frozen numbers cannot be beaten', () => {
    const frozen = estimate(
      [
        { id: 'a', clicks: 2000, orders: 60, weight: 100 },
        { id: 'c', clicks: 300, orders: 6, weight: 0 },
      ],
      500,
    );
    assert.equal(frozen.kind, 'never');
    assert.equal(frozen.rivalId, 'c');
    // With traffic on both sides the same numbers have an answer.
    const both = estimate(
      [
        { id: 'a', clicks: 2000, orders: 60, weight: 50 },
        { id: 'c', clicks: 300, orders: 6, weight: 50 },
      ],
      500,
    );
    assert.equal(both.kind, 'remaining');
  });

  it('future clicks follow the current weights, not the past split', () => {
    const rows = [
      { id: 'a', clicks: 500, orders: 10 },
      { id: 'b', clicks: 500, orders: 20 },
    ];
    const even = estimate(rows.map((r) => ({ ...r, weight: 50 })), 100);
    const skewed = estimate(rows.map((r) => ({ ...r, weight: r.id === 'a' ? 90 : 10 })), 100);
    assert.equal(even.clicks, estimate(rows, 100).clicks, '50/50 now = the past 50/50 split');
    assert.ok(skewed.clicks! > even.clicks!, `${skewed.clicks} vs ${even.clicks}`);
  });

  it('"any of them" only when every version is close to the leader', () => {
    const e = estimate(
      [
        { id: 'a', clicks: 3000, orders: 90 },
        { id: 'b', clicks: 3000, orders: 87 },
        { id: 'c', clicks: 3000, orders: 30 },
      ],
      1000,
    );
    assert.equal(e.kind, 'too-slow');
    assert.equal(e.small, true);
    assert.equal(e.allClose, false);
  });

  it('says nothing it cannot back: too few orders, a version without clicks, more orders than clicks, a tie, already decided', () => {
    assert.equal(estimate([{ id: 'a', clicks: 300, orders: 1 }, { id: 'b', clicks: 300, orders: 1 }], 100).kind, 'no-data');
    assert.equal(estimate([{ id: 'a', clicks: 300, orders: 9 }, { id: 'b', clicks: 0, orders: 0 }], 100).kind, 'no-clicks');
    const odd = estimate([{ id: 'a', clicks: 10, orders: 3 }, { id: 'b', clicks: 5, orders: 8 }], 100);
    assert.equal(odd.kind, 'mismatch');
    assert.equal(odd.rivalId, 'b');
    assert.equal(estimate([{ id: 'a', clicks: 300, orders: 9 }, { id: 'b', clicks: 300, orders: 4 }], null).days, null, 'no pace, no days');
    assert.equal(estimate([{ id: 'a', clicks: 1000, orders: 20 }, { id: 'b', clicks: 1000, orders: 20 }], 100).kind, 'equal');
    assert.equal(estimate([{ id: 'a', clicks: 1000, orders: 60 }, { id: 'b', clicks: 1000, orders: 20 }], 100).kind, 'done');
  });

  it('rounds like an estimate', () => {
    assert.equal(roughly(57), '57');
    assert.equal(roughly(1282), '1.300');
    assert.equal(roughly(248_311), '250.000');
  });
});

describe('A/B live periods', () => {
  const t = (h: number) => new Date(Date.UTC(2026, 9, 1, h));
  it('opens, closes and measures the time live', () => {
    let spans = openSpan([], t(0));
    spans = openSpan(spans, t(1));
    assert.equal(spans.length, 1, 'already open: unchanged');
    spans = closeSpan(spans, t(5));
    spans = openSpan(spans, t(10));
    assert.equal(currentSpanStart(spans)?.getTime(), t(10).getTime());
    assert.equal(liveMs(spans, t(0), t(12)) / 3600_000, 7);
    assert.equal(liveMs(spans, t(4), t(11)) / 3600_000, 2);
    assert.equal(inSpans(spans, t(3)), true);
    assert.equal(inSpans(spans, t(7)), false, 'paused: an order then is not the test\'s');
    assert.equal(inSpans(spans, t(30)), true, 'open stretch reaches now');
  });

  it('round-trips, and rebuilds one stretch for tests from before', () => {
    const spans = closeSpan(openSpan([], t(0)), t(2));
    assert.deepEqual(parseSpans(serializeSpans(spans), { startedAt: null, status: 'paused', updatedAt: t(9) }), spans);
    assert.deepEqual(parseSpans(null, { startedAt: t(1), status: 'live', updatedAt: t(9) }), [[t(1), null]]);
    assert.deepEqual(parseSpans(null, { startedAt: t(1), status: 'paused', updatedAt: t(9) }), [[t(1), t(9)]]);
    assert.deepEqual(parseSpans('lixo', { startedAt: null, status: 'draft', updatedAt: t(9) }), []);
  });
});

describe('scheduled start on the store clock', () => {
  it('reads a datetime-local value in the store time zone, both ways', () => {
    // Bogotá is UTC-5 all year.
    const at = zonedToUtc('2026-10-05T08:00', 'America/Bogota');
    assert.equal(at.toISOString(), '2026-10-05T13:00:00.000Z');
    assert.equal(localDateTime(at, 'America/Bogota'), '2026-10-05T08:00');
  });

  it('follows daylight saving where the store has it', () => {
    // São Paulo has no DST since 2019; Madrid does (CEST = UTC+2 in summer, CET = UTC+1 in winter).
    assert.equal(zonedToUtc('2026-07-01T10:00', 'Europe/Madrid').toISOString(), '2026-07-01T08:00:00.000Z');
    assert.equal(zonedToUtc('2026-12-01T10:00', 'Europe/Madrid').toISOString(), '2026-12-01T09:00:00.000Z');
  });

  it('only accepts the datetime-local shape', () => {
    assert.ok(DATETIME_SHAPE.test('2026-10-05T08:00'));
    assert.ok(!DATETIME_SHAPE.test('2026-10-05 08:00'));
    assert.ok(!DATETIME_SHAPE.test('amanhã'));
  });
});
