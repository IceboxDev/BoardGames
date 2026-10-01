import type { ResistanceRecord, Role } from "@boardgames/core/games/the-resistance/record";
import type { Assumptions } from "@boardgames/core/games/the-resistance/solver/assumptions";
import type { SeatNamer } from "@boardgames/core/games/the-resistance/solver/deductions";
import type { ModelEnv } from "@boardgames/core/games/the-resistance/solver/model";
import type { Perspective } from "@boardgames/core/games/the-resistance/solver/posterior";
import { useCallback, useState } from "react";
import { loadAssumptions, saveAssumptions } from "./storage";

export const SOLVER_BASE = "/play/the-resistance/solo";

/** "P3" when a table has no names; names otherwise. */
export function seatNamer(names?: readonly (string | null | undefined)[]): SeatNamer {
  return (seat) => names?.[seat]?.trim() || `P${seat + 1}`;
}

export function envFor(record: ResistanceRecord, assumptions: Assumptions): ModelEnv {
  return {
    playerCount: record.playerCount,
    blindSpies: record.variants.blindSpies,
    assumptions,
  };
}

export interface PerspectiveOption {
  id: string;
  label: string;
  perspective: Perspective;
}

export const PUBLIC_PERSPECTIVE: PerspectiveOption = {
  id: "public",
  label: "Table",
  perspective: { kind: "public" },
};

/** The spies a seat knew from the reveal. */
export function knownSpiesFor(roles: readonly Role[], seat: number, blind: boolean): number[] {
  if (roles[seat] !== "spy") return [];
  return blind ? [seat] : roles.flatMap((r, i) => (r === "spy" ? [i] : []));
}

/**
 * Perspectives a finished game offers: the table's, the truth, and each seat's
 * own (what it knew while playing).
 */
export function finishedPerspectives(
  record: ResistanceRecord,
  name: SeatNamer,
): PerspectiveOption[] {
  const roles = record.roles;
  if (!roles) return [PUBLIC_PERSPECTIVE];
  return [
    PUBLIC_PERSPECTIVE,
    { id: "truth", label: "Truth", perspective: { kind: "omniscient", roles } },
    ...roles.map(
      (role, seat): PerspectiveOption => ({
        id: `seat-${seat}`,
        label: name(seat),
        perspective: {
          kind: "seat",
          seat,
          role,
          knownSpies: knownSpiesFor(roles, seat, record.variants.blindSpies),
        },
      }),
    ),
  ];
}

/** The viewer's tuned assumptions, remembered in this browser. */
export function useAssumptions(): [Assumptions, (next: Assumptions) => void] {
  const [assumptions, setState] = useState<Assumptions>(loadAssumptions);
  const set = useCallback((next: Assumptions) => {
    setState(next);
    saveAssumptions(next);
  }, []);
  return [assumptions, set];
}

export const pct = (p: number) => `${Math.round(p * 100)}%`;
