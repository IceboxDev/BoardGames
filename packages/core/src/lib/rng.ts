/**
 * Shared seedable RNG + Fisher-Yates shuffle utilities.
 *
 * This is the single source of truth for randomness in core. Games that need
 * reproducibility (exploding-kittens, pandemic, sky-team) build a deterministic
 * `Rng` via `createRng(seed)`; games that don't yet thread a seed fall back to
 * `defaultRng` (Math.random). The `createRng`/`randomSeed` implementations here
 * are byte-for-byte identical to the per-game copies they replaced, so a given
 * seed produces the exact same sequence — and therefore the same shuffles — as
 * before.
 */

/** A function that returns a random number in [0, 1), matching Math.random(). */
export type Rng = () => number;

/** Default non-deterministic RNG, backed by Math.random. */
export const defaultRng: Rng = Math.random;

/** Mulberry32 — fast, well-distributed 32-bit PRNG. */
export function createRng(seed: number): Rng {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/** Generate a seed from Math.random() for when no specific seed is needed. */
export function randomSeed(): number {
  return (Math.random() * 0x100000000) >>> 0;
}

/** Fisher-Yates shuffle, in-place. Defaults to a Math.random-backed rng. */
export function shuffleInPlace<T>(arr: T[], rng: Rng = defaultRng): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

/** Fisher-Yates shuffle returning a new array. Defaults to a Math.random-backed rng. */
export function shuffle<T>(arr: readonly T[], rng: Rng = defaultRng): T[] {
  const a = [...arr];
  shuffleInPlace(a, rng);
  return a;
}
