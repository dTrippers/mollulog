// Monte Carlo helpers for recruitment pull-count distributions.
//
// Exact dynamic programming over acquired copies grows with the product of (copies + 1) per student,
// so several students aimed at high tiers become intractable. The pull-count distributions are
// estimated from a fixed number of seeded runs instead: the same input always gives the same result.

// Runs per distribution. Against the exact calculation, 100,000 runs kept the mean within about two
// pulls and the 10%/90% quantiles within one ten-pull.
export const RECRUITMENT_SAMPLE_COUNT = 100_000;

const RECRUITMENT_SAMPLE_SEED = 0x2f6b_4e1d;

/** Uniform random number in [0, 1). */
export type RandomSource = () => number;

/** Mulberry32: small, fast, and deterministic for a given seed. */
export function createRandomSource(seed = RECRUITMENT_SAMPLE_SEED): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Number of consecutive misses before the next hit when each pull hits with `hitProbability`.
 * Returns Infinity when nothing can hit.
 */
export function sampleMissesBeforeHit(random: RandomSource, hitProbability: number): number {
  if (hitProbability <= 0) return Number.POSITIVE_INFINITY;
  if (hitProbability >= 1) return 0;
  // 1 - random() is in (0, 1], so the logarithm is finite.
  return Math.floor(Math.log(1 - random()) / Math.log1p(-hitProbability));
}

/** Estimates a pull-count distribution from seeded runs; `runPulls` returns the pulls of one run. */
export function sampleDistribution(runPulls: (random: RandomSource) => number): number[] {
  const random = createRandomSource();
  const counts: number[] = [];
  for (let run = 0; run < RECRUITMENT_SAMPLE_COUNT; run += 1) {
    const pulls = runPulls(random);
    while (counts.length <= pulls) counts.push(0);
    counts[pulls] = (counts[pulls] ?? 0) + 1;
  }
  return counts.map((count) => count / RECRUITMENT_SAMPLE_COUNT);
}
