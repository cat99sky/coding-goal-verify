// Invoice helpers used by the fixture repo.
//
// Integer cents only. No floating point money in the public API.
//
// applyRate() rounds half away from zero for either sign.
//
// allocate() uses the largest-remainder method: floors first, then hands the
// leftover cents to the largest fractional remainders, ties to the earlier
// line.

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
  const magnitude = (Math.abs(cents) * basisPoints) / 10000;
  const rounded = Math.floor(magnitude + 0.5);
  return cents < 0 ? -rounded : rounded;
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
  const shares = [];
  const remainders = [];
  for (let index = 0; index < weights.length; index += 1) {
    const numerator = totalCents * weights[index];
    shares.push(Math.floor(numerator / totalWeight));
    remainders.push(numerator % totalWeight);
  }
  let assigned = shares.reduce((sum, value) => sum + value, 0);
  let remainder = totalCents - assigned;
  const order = weights
    .map((_, index) => index)
    .sort((a, b) => remainders[b] - remainders[a] || a - b);
  for (let index = 0; remainder > 0; index += 1) {
    shares[order[index % order.length]] += 1;
    remainder -= 1;
    assigned += 1;
  }
  return { shares, assigned };
}
