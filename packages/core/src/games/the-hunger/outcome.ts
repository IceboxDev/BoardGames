import type { RankedOutcome } from "../../machines/outcome";
import type { HungerResult } from "./types";

/** The engine already ranks every seat (tiebreaks included). */
export function hungerOutcome(result: HungerResult): RankedOutcome {
  return { kind: "ranked", placements: [...result.placements], scores: [...result.scores] };
}
