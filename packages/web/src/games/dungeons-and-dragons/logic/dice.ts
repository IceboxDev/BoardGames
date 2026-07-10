// The tool's only source of randomness. It lived inside InitiativePanel, a
// 479-line component, which made it untestable and easy to re-roll by accident
// on a re-render. Keep every future die here.

/** A d20 plus a modifier. Range: `1 + mod` … `20 + mod`. */
export function rollD20(mod: number): number {
  return Math.floor(Math.random() * 20) + 1 + mod;
}
