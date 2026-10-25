import type { Color } from "@boardgames/core/games/chess/engine/types";
import { ChessConfigSchema } from "@boardgames/core/games/chess/manifest";

/** Where "Play from here" goes: the solo setup, with the line to start after and your side. */
export function playFromHereUrl(moves: readonly string[], side: Color): string {
  return `/play/chess/solo?line=${moves.join(".")}&side=${side}`;
}

/** The line and side a setup URL carries (`?line=e2e4.e7e5&side=b`), or `null` when none or not legal. */
export function lineFromSearch(params: URLSearchParams): { moves: string[]; side: Color } | null {
  const raw = params.get("line");
  if (!raw) return null;
  const parsed = ChessConfigSchema.shape.openingMoves.safeParse(raw.split(".").filter(Boolean));
  if (!parsed.success || parsed.data.length === 0) return null;
  return { moves: parsed.data, side: params.get("side") === "b" ? "b" : "w" };
}
