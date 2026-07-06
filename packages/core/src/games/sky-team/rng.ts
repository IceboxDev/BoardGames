import type { Rng } from "../../lib/rng";

export type { Rng } from "../../lib/rng";
export { createRng, randomSeed } from "../../lib/rng";

export function rollDie(rng: Rng): 1 | 2 | 3 | 4 | 5 | 6 {
  return (Math.floor(rng() * 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6;
}
