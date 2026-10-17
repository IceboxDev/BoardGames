/**
 * The trainer's three kinds of move, one colour each for the explorer's dots,
 * the board's arrows and the legend:
 *   - My pick: a move you set yourself (or fixed in code), whatever the engine says
 *   - Engine: the engine's best (your move by default; padding for the opponent)
 *   - Popular: most played — against you (the opponent's replies) or on lichess
 */
import type { TreeMoveSource } from "@boardgames/core/games/chess/trainer/tree";

export type MoveKind = "pick" | "engine" | "popular";

export const KIND_OF: Record<TreeMoveSource, MoveKind> = {
  handpicked: "pick",
  best: "engine",
  engine: "engine",
  played: "popular",
  popular: "popular",
};

/** The kind colours as CSS values (theme variables), for two-tone dots. */
export const KIND_COLOR: Record<MoveKind, string> = {
  pick: "var(--color-amber-400)",
  engine: "var(--color-sky-400)",
  popular: "var(--color-emerald-400)",
};

/**
 * A move's kinds: what the tree has it as, plus "engine" when it is also the
 * engine's best here (a popular reply or your pick that the engine agrees
 * with shows both). A move outside the tree that is the engine's best is just
 * "engine".
 */
export function kindsOf(source: TreeMoveSource | null, engineBest: boolean): MoveKind[] {
  const primary = source ? KIND_OF[source] : null;
  if (!primary) return engineBest ? ["engine"] : [];
  return engineBest && primary !== "engine" ? [primary, "engine"] : [primary];
}

export const KIND: Record<MoveKind, { label: string; dot: string; title: string }> = {
  pick: {
    label: "My pick",
    dot: "bg-amber-400",
    title: "Your pick — you play this here, whatever the engine says",
  },
  engine: {
    label: "Engine",
    dot: "bg-sky-400",
    title: "The engine's best move here — on the board, the boldest arrow",
  },
  popular: {
    label: "Popular",
    dot: "bg-emerald-400",
    title: "Most played here — against you, or on lichess",
  },
};

/** A tree move's own explanation, a little more precise than its kind. */
export const SOURCE_TITLE: Record<TreeMoveSource, string> = {
  handpicked: "My pick — you play this here, whatever the engine says",
  best: "Engine — the engine's best, which you chose to play",
  engine: "Engine — the engine's best move here",
  played: "Popular — played against you",
  popular: "Popular — the lichess database's most played move (padding)",
};
