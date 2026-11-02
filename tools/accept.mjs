#!/usr/bin/env node
// Acceptance command for the fixture repo.
//
// This file is the gate. It is not a hint: it asserts the documented contract
// of src/invoice.mjs and exits non-zero on the first violated contract group.
// It must not be edited to make the gate pass; fix src/invoice.mjs instead.
//
// Exit codes: 0 = all contract groups pass, 1 = at least one failure.

import { allocate, applyRate, formatCents, parseCents } from '../src/invoice.mjs';

const failures = [];
let checks = 0;

function check(group, label, actual, expected) {
  checks += 1;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`[${group}] ${label}: expected ${e}, got ${a}`);
}

function checkThrows(group, label, fn) {
  checks += 1;
  try {
    fn();
    failures.push(`[${group}] ${label}: expected a TypeError, nothing was thrown`);
  } catch (error) {
    if (!(error instanceof TypeError)) {
      failures.push(`[${group}] ${label}: expected TypeError, got ${error?.constructor?.name ?? typeof error}`);
    }
  }
}

// --- group 1: parse/format round trip -------------------------------------
check('parse', 'positive', parseCents('0.01'), 1);
check('parse', 'negative', parseCents('-123.45'), -12345);
check('parse', 'one decimal digit', parseCents('9.5'), 950);
check('parse', 'whole number', parseCents('7'), 700);
check('format', 'positive', formatCents(1), '0.01');
check('format', 'negative', formatCents(-12345), '-123.45');
checkThrows('parse', 'rejects garbage', () => parseCents('1,000'));
checkThrows('parse', 'rejects three decimals', () => parseCents('1.234'));

// --- group 2: applyRate rounds half away from zero, both signs -------------
check('applyRate', 'exact', applyRate(10000, 825), 825);
check('applyRate', 'half up positive', applyRate(150, 500), 8);
check('applyRate', 'just below half positive', applyRate(149, 500), 7);
check('applyRate', 'just above half positive', applyRate(151, 500), 8);
check('applyRate', 'half away from zero negative', applyRate(-150, 500), -8);
check('applyRate', 'just below half negative', applyRate(-149, 500), -7);
check('applyRate', 'just above half negative', applyRate(-151, 500), -8);
check('applyRate', 'zero rate', applyRate(12345, 0), 0);
checkThrows('applyRate', 'rejects fractional basis points', () => applyRate(100, 12.5));
checkThrows('applyRate', 'rejects negative basis points', () => applyRate(100, -1));
check('applyRate', 'accepts 100% rate', applyRate(100, 10000), 100);
checkThrows('applyRate', 'rejects rate just above 100%', () => applyRate(100, 10001));
checkThrows('applyRate', 'rejects rate far above 100%', () => applyRate(100, 20000));

// --- group 3: allocate sums exactly and ranks remainders -------------------
check('allocate', 'even split', allocate(1000, [1, 1]).shares, [500, 500]);
check('allocate', 'remainder to earlier line on a tie', allocate(100, [1, 1, 1]).shares, [34, 33, 33]);
check('allocate', 'largest fractional remainder first', allocate(10, [1, 2, 3]).shares, [2, 3, 5]);
check('allocate', 'remainder larger than one cent', allocate(100, [1, 1, 1, 1, 1, 1]).shares, [17, 17, 17, 17, 16, 16]);
check('allocate', 'zero total', allocate(0, [5, 7]).shares, [0, 0]);
check('allocate', 'single line gets everything', allocate(999, [3]).shares, [999]);
checkThrows('allocate', 'rejects zero weight', () => allocate(100, [1, 0]));
checkThrows('allocate', 'rejects empty weights', () => allocate(100, []));
checkThrows('allocate', 'rejects negative total', () => allocate(-1, [1]));

// --- group 4: deterministic pseudo-random invariants ----------------------
let seed = 0x2f6e2b1;
function nextInt(max) {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed % max;
}
for (let round = 0; round < 200; round += 1) {
  const lineCount = 1 + nextInt(8);
  const weights = Array.from({ length: lineCount }, () => 1 + nextInt(50));
  const total = nextInt(200000);
  const { shares, assigned } = allocate(total, weights);
  checks += 1;
  if (assigned !== total) failures.push(`[invariant] round ${round}: assigned ${assigned} != total ${total}`);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < lineCount; index += 1) {
    const exact = (total * weights[index]) / totalWeight;
    const floor = Math.floor(exact);
    checks += 1;
    if (shares[index] !== floor && shares[index] !== floor + 1) {
      failures.push(`[invariant] round ${round} line ${index}: share ${shares[index]} is not floor(${exact}) or floor+1`);
    }
  }
}

// --- report ---------------------------------------------------------------
if (failures.length > 0) {
  console.error(`accept: FAIL (${failures.length} failed contract checks, ${checks} assertions)`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`accept: PASS (${checks} assertions)`);
process.exit(0);
