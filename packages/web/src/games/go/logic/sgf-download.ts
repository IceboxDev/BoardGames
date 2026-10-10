import type { GoReplayLog } from "@boardgames/core/games/go/replay-log";
import { toSgf } from "@boardgames/core/games/go/sgf";
import type { GoPlayerView } from "@boardgames/core/games/go/view";

/** A finished game's record, rebuilt from the final view (clock times aren't in the view). */
export function viewToLog(view: GoPlayerView): GoReplayLog | null {
  if (!view.result) return null;
  const b = view.result.breakdown;
  return {
    formatVersion: 1,
    size: view.size,
    komi: view.komi,
    handicap: view.handicap,
    rules: "chinese",
    timeControl: view.clock?.timeControl ?? { kind: "none" },
    players: [view.players[0], view.players[1]],
    moves: view.moves.map((m) => ({ c: m.color, p: m.point, ms: 0 })),
    undos: [],
    end: {
      reason: view.result.reason,
      winner: view.result.winner,
      result: view.result.result,
      dead: [...view.result.dead],
      ...(b ? { blackTotal: b.black.total, whiteTotal: b.white.total } : {}),
    },
  };
}

/** Save `log` as an .sgf file. */
export function downloadSgf(log: GoReplayLog, names: readonly string[]): void {
  const date = new Date().toISOString().slice(0, 10);
  const text = toSgf(log, { black: names[0], white: names[1], date });
  const url = URL.createObjectURL(new Blob([text], { type: "application/x-go-sgf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `go-${log.size}x${log.size}-${date}.sgf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
