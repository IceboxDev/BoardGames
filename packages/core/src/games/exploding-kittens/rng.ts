/** A function that returns a random number in [0, 1), matching Math.random(). */
export type Rng = () => number;

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
