// Which trained board value net the rewards-phase search blends into its
// leaf per table size (none = the plain standing objective). Weight modules
// come from scripts/senso-train/train_vboard.py (--out).
import type { MlpModel } from "./mlp";

export const VBOARD_MODELS: { [players: number]: MlpModel } = {};

export function vboardModelFor(players: number): MlpModel | null {
  return VBOARD_MODELS[players] ?? null;
}
