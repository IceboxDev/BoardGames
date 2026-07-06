/**
 * Deterministic PRNG for Pandemic — re-exported from the shared core RNG
 * (`@boardgames/core/lib/rng`). Having a shared, seedable RNG makes games
 * fully reproducible: given the same SetupConfig (including seed) and the same
 * action sequence, the engine produces byte-identical state.
 *
 * This is what makes the replay log roundtrip-safe without having to snapshot
 * every intermediate deck ordering.
 */

export type { Rng } from "../../lib/rng";
export { createRng, randomSeed } from "../../lib/rng";
