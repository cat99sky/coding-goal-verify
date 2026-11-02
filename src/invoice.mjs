// Invoice helpers used by the fixture repo.
//
// Integer cents only. No floating point money in the public API.
//
// DEFECT 1 (planted): applyRate() uses Math.floor, so refunds (negative
// amounts) and non-exact fractional cents are rounded toward negative
// infinity. The documented contract is "round half away from zero".
//
// DEFECT 2 (planted): allocate() pushes the whole remainder onto the last
// line and ignores the fractional ranking, so a remainder larger than one
// cent is misassigned and the documented "largest remainder first, ties to
// the earlier line" rule is not honored.

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
 * Contract: basisPoints must be an integer in [0, 10000] (0% to 100%);
 * result is rounded half away from zero, for either sign.
 */
export function applyRate(cents, basisPoints) {
  if (!Number.isSafeInteger(cents)) throw new TypeError('cents must be a safe integer');
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) {
    throw new TypeError('basisPoints must be a safe integer between 0 and 10000');
  }
  const product = cents * basisPoints;
  const magnitude = BigInt(Math.abs(product));
  // Round half away from zero using integer arithmetic, then restore the sign.
  const rounded = Number((magnitude + 5000n) / 10000n);
  return product < 0 ? -rounded : rounded;
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
  let assigned = 0;
  for (let index = 0; index < weights.length; index += 1) {
    // Integer division avoids floating-point drift in the proportional share.
    const numerator = BigInt(totalCents) * BigInt(weights[index]);
    const denominator = BigInt(totalWeight);
    const share = Number(numerator / denominator);
    shares.push(share);
    assigned += share;
    remainders.push({ index, remainder: numerator % denominator });
  }
  const leftover = totalCents - assigned;
  // Largest fractional remainder first; ties go to the earlier line (stable sort).
  const ranked = remainders
    .slice()
    .sort((a, b) => (a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1));
  for (let step = 0; step < leftover; step += 1) {
    const { index } = ranked[step % ranked.length];
    shares[index] += 1;
    assigned += 1;
  }
  return { shares, assigned };
}
