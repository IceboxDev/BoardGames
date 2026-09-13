// Which trained expected-tier net the search uses per table size (none = the
// value-net path is unavailable for that table and playouts run to the round
// end as before). Weight modules come from scripts/senso-train/train_vtrick.py.
import type { MlpModel } from "./mlp";

export const VTRICK_MODELS: { [players: number]: MlpModel } = {};

export function vtrickModelFor(players: number): MlpModel | null {
  return VTRICK_MODELS[players] ?? null;
}
