import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { addDays, dayStart, daysBetween, evenWeights, localDay, pValue, verdict } from '../app/lib/ab.ts';

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
