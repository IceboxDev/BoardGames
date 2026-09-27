import type { RankedOutcome } from "../../machines/outcome";
import type { SensoResult } from "./types";

/** The engine already ranks every seat (tiebreaks included). */
export function sensoOutcome(result: SensoResult): RankedOutcome {
  return { kind: "ranked", placements: [...result.placements], scores: [...result.scores] };
}
