// Invoice helpers used by the fixture repo.
//
// Integer cents only. No floating point money in the public API.
//
/** Convert a dollar string such as "12.34" into integer cents. */
export function parseCents(text) {
  if (typeof text !== 'string' || !/^-?\d+(\.\d{1,2})?$/.test(text)) {
    throw new TypeError(`invalid money string: ${String(text)}`);
  }
  const negative = text.startsWith('-');
  const [whole, frac = ''] = (negative ? text.slice(1) : text).split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return negative ? -cents : cents;
}

/** Format integer cents as a dollar string. */
export function formatCents(cents) {
  if (!Number.isSafeInteger(cents)) throw new TypeError('cents must be a safe integer');
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const text = `${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
  return negative ? `-${text}` : text;
}

/**
 * Apply a rate expressed in basis points (1 bp = 0.01%) to integer cents.
 * Contract: result is rounded half away from zero, for either sign.
 */
export function applyRate(cents, basisPoints) {
  if (!Number.isSafeInteger(cents)) throw new TypeError('cents must be a safe integer');
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0) {
    throw new TypeError('basisPoints must be a non-negative safe integer');
  }
  const numerator = cents * basisPoints;
  const magnitude = Math.floor((Math.abs(numerator) * 2 + 10000) / 20000);
  return numerator < 0 ? -magnitude : magnitude;
}

/**
 * Split totalCents across the given weights.
 * Contract: the returned cents sum exactly to totalCents; each line gets the
 * floor of its proportional share, and the remaining cents are handed out one
 * each to the lines with the largest fractional remainder, ties going to the
 * earlier line. Weights are positive integers; a zero total yields zeros.
 */
export function allocate(totalCents, weights) {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
    throw new TypeError('totalCents must be a non-negative safe integer');
  }
  if (!Array.isArray(weights) || weights.length === 0) throw new TypeError('weights must be a non-empty array');
  for (const weight of weights) {
    if (!Number.isSafeInteger(weight) || weight <= 0) throw new TypeError('weights must be positive safe integers');
  }
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const shares = weights.map((weight) => Math.floor((totalCents * weight) / totalWeight));
  const remainders = weights.map((weight) => (totalCents * weight) % totalWeight);
  let assigned = shares.reduce((sum, value) => sum + value, 0);
  const remainder = totalCents - assigned;
  const order = weights.map((_, index) => index);
  order.sort((a, b) => remainders[b] - remainders[a] || a - b);
  for (let i = 0; i < remainder; i += 1) {
    shares[order[i]] += 1;
    assigned += 1;
  }
  return { shares, assigned };
}
