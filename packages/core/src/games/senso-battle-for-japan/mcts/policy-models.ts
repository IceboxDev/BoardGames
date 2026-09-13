// Which fitted net drives the playouts and which one weighs the deals, by
// table size. The shared nets were fitted mostly on 2-player decisions; a
// per-table net is only used where its A/B passed (see config.ts).
import { OPPONENT_MODEL } from "./opponent-weights";
import { OPPONENT_MODEL_3P } from "./opponent-weights-3p";
import { OPPONENT_MODEL_5P } from "./opponent-weights-5p";
import type { PolicyModel } from "./policy";
import { POLICY_MODEL } from "./policy-weights";
import { POLICY_MODEL_3P } from "./policy-weights-3p";
import { POLICY_MODEL_5P } from "./policy-weights-5p";

export type ModelChoice = "shared" | "per-table";
/** Opponent model: a fitted population net, or the (Shōgun-distilled) playout net itself. */
export type OpponentChoice = ModelChoice | "playout";

interface ModelTable {
  shared: PolicyModel;
  /** Per player count; absent = fall back to `shared`. */
  [players: number]: PolicyModel;
}

/** Playout policy: distilled from Shōgun's own decisions. */
export const PLAYOUT_MODELS: ModelTable = {
  shared: POLICY_MODEL,
  3: POLICY_MODEL_3P,
  5: POLICY_MODEL_5P,
};

/** Opponent (deal-likelihood) model: fitted on a population of styles. */
export const OPPONENT_MODELS: ModelTable = {
  shared: OPPONENT_MODEL,
  3: OPPONENT_MODEL_3P,
  5: OPPONENT_MODEL_5P,
};

export function playoutModelFor(players: number, choice: ModelChoice): PolicyModel {
  return (choice === "per-table" && PLAYOUT_MODELS[players]) || PLAYOUT_MODELS.shared;
}

export function opponentModelFor(
  players: number,
  choice: OpponentChoice,
  playout: ModelChoice = "shared",
): PolicyModel {
  if (choice === "playout") return playoutModelFor(players, playout);
  return (choice === "per-table" && OPPONENT_MODELS[players]) || OPPONENT_MODELS.shared;
}
