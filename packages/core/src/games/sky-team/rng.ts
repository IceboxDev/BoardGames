export type Rng = () => number;

export function createRng(seed: number): Rng {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

export function randomSeed(): number {
  return (Math.random() * 0x100000000) >>> 0;
}

export function rollDie(rng: Rng): 1 | 2 | 3 | 4 | 5 | 6 {
  return (Math.floor(rng() * 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6;
}
