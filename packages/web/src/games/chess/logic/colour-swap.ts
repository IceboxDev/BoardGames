import type { SoloStart } from "../../../hooks/useSessionFlow";
import type { ChessSetup } from "../components/SetupScreen";

/** "Play as Black" after a game as White, and the reverse — the human's seat 0 is White. */
export function colourSwap(setup: ChessSetup, start: SoloStart) {
  const wasWhite = start.seats[0]?.kind === "human";
  return [
    {
      label: wasWhite ? "Play as Black" : "Play as White",
      setup: { ...setup, color: wasWhite ? ("b" as const) : ("w" as const) },
    },
  ];
}
