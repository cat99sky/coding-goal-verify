import test from 'node:test';
import assert from 'node:assert/strict';

import { allocate, applyRate, formatCents, parseCents } from '../src/invoice.mjs';

test('parseCents and formatCents round-trip simple amounts', () => {
  assert.equal(parseCents('12.34'), 1234);
  assert.equal(parseCents('-0.05'), -5);
  assert.equal(formatCents(1234), '12.34');
  assert.equal(formatCents(-5), '-0.05');
});

test('applyRate rounds a positive amount', () => {
  assert.equal(applyRate(10000, 825), 825);
  assert.equal(applyRate(101, 500), 5);
});

test('allocate splits a simple total', () => {
  assert.deepEqual(allocate(1000, [1, 1]).shares, [500, 500]);
  assert.deepEqual(allocate(1000, [2, 1]).shares, [667, 333]);
});
