/**
 * A personal opening tree (repertoire) — the document the trainer stores and
 * shows. Built by `builder.ts` from the trainee's imported games; see there
 * for the rules. Positions are keyed by `positionKey`, so transpositions share
 * a node and the "tree" is really a DAG.
 */
import { z } from "zod";
import { TrainerSpeedSchema } from "./imported-game";

export const TreeSettingsSchema = z.object({
  /** Your first N moves are yours to choose ("Best" or a move); later ones are the engine's. */
  handpickMoves: z.number().int().min(0).max(20).default(3),
  /** Search depth for an in-browser engine choice (only without a deep spec). */
  engineDepth: z.number().int().min(8).max(30).default(18),
  /**
   * The "best move" definition evaluations come from (`eval-policy.ts`):
   * `BEST_MOVE_V1` = the analysis farm's deep search; `null` = the browser's
   * Stockfish at `engineDepth`.
   */
  evalSpec: z.enum(["BEST_MOVE_V1"]).nullable().default("BEST_MOVE_V1"),
  /** Only games of these speeds; empty = all. */
  speeds: z.array(TrainerSpeedSchema).max(6).default([]),
  /** Opponent replies a position should have (the first opponent move excepted). */
  minReplies: z.number().int().min(1).max(6).default(3),
});
export type TreeSettings = z.infer<typeof TreeSettingsSchema>;

/** One engine line, scored from the side to move (`cp` or `mate`). */
export const EngineLineSchema = z.object({
  uci: z.string().max(5),
  cp: z.number().int().nullable(),
  mate: z.number().int().nullable(),
  depth: z.number().int().min(0),
  seldepth: z.number().int().min(0).nullable().optional(),
  nodes: z.number().int().nonnegative().nullable().optional(),
});
export type EngineLine = z.infer<typeof EngineLineSchema>;

/** Lc0's root statistics for one move, from the side to move. */
export const Lc0StatSchema = z.object({
  uci: z.string().max(5),
  w: z.number().min(0).max(1),
  d: z.number().min(0).max(1),
  l: z.number().min(0).max(1),
  visits: z.number().int().nonnegative(),
});
export type Lc0Stat = z.infer<typeof Lc0StatSchema>;

/** A move as the lichess database plays it: how many games. */
export const PopularMoveSchema = z.object({
  uci: z.string().max(5),
  games: z.number().int().nonnegative(),
});
export type PopularMove = z.infer<typeof PopularMoveSchema>;

/** What the trainee chose for a handpicked position. */
export const UserChoiceSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("handpicked"), uci: z.string().max(5) }),
  z.object({ source: z.literal("best") }),
]);
export type UserChoice = z.infer<typeof UserChoiceSchema>;

/**
 * Where a move in the tree came from.
 *   - your moves: `handpicked`, `best` (you chose the engine's), `engine` (past your handpicked moves)
 *   - opponent moves: `played` (against you), `engine` or `popular` (padding)
 */
export const TreeMoveSourceSchema = z.enum(["handpicked", "best", "engine", "played", "popular"]);
export type TreeMoveSource = z.infer<typeof TreeMoveSourceSchema>;

export const TreeMoveSchema = z.object({
  uci: z.string().max(5),
  san: z.string().max(10),
  source: TreeMoveSourceSchema,
  /** Your games in which this move was played here (any route to the position). */
  games: z.number().int().nonnegative(),
  /** Of the games still following the tree, how many went this way. */
  following: z.number().int().nonnegative(),
});
export type TreeMove = z.infer<typeof TreeMoveSchema>;

export const TreeNodeStatusSchema = z.enum([
  /** Moves not worked out yet. */
  "open",
  /** A handpicked position waiting for your choice. */
  "decision",
  /** Waiting for the analysis farm's evaluation. */
  "awaiting-eval",
  "done",
  /** Mate or stalemate. */
  "terminal",
]);

export const TreeNodeSchema = z.object({
  fen: z.string().max(100),
  /** Plies from the start on the first route the tree found. */
  ply: z.number().int().min(0),
  side: z.enum(["user", "opp"]),
  status: TreeNodeStatusSchema,
  /** Your move (one) or the opponent's replies. */
  moves: z.array(TreeMoveSchema),
  /** Games that reached this position while following the tree. */
  following: z.number().int().nonnegative(),
  /** All your games that reached this position, by any route. */
  seen: z.number().int().nonnegative(),
  /** Your positions: what you played here yourself (most first, at most 6). */
  history: z
    .array(z.object({ uci: z.string(), san: z.string(), games: z.number(), score: z.number() }))
    .max(6)
    .optional(),
  /** Your positions: following games that left the tree here, by the move you played instead. */
  deviations: z.array(z.object({ uci: z.string(), san: z.string(), games: z.number() })).optional(),
  /** Following games that ended in this position. */
  ended: z.number().int().nonnegative().optional(),
  choice: UserChoiceSchema.optional(),
  engine: z.array(EngineLineSchema).max(12).optional(),
  /** Which "best move" definition `engine` was made under (absent: the browser's quick search). */
  evalSpec: z.string().max(32).optional(),
  /** Where the evaluation came from: the farm's own search, lichess cloud, ChessDB. */
  evalSource: z.string().max(20).optional(),
  /** Your positions: the moves Stockfish scored as equal (Lc0 chose among them). */
  ties: z.array(z.string().max(5)).max(12).optional(),
  /** Lc0 preferred a move Stockfish rates clearly worse. */
  contested: z.boolean().optional(),
  lc0: z.array(Lc0StatSchema).max(12).optional(),
  popular: z.array(PopularMoveSchema).max(12).optional(),
});
export type TreeNode = z.infer<typeof TreeNodeSchema>;

export const TreeStatsSchema = z.object({
  games: z.number().int().nonnegative(),
  /** Games whose own move left the tree. */
  deviated: z.number().int().nonnegative(),
  /** Games that followed the tree to their last move. */
  ended: z.number().int().nonnegative(),
  /** Games waiting at a position you haven't chosen a move for yet. */
  waiting: z.number().int().nonnegative(),
  /** Mean plies your games stayed in the tree (of those settled). */
  avgFollowPlies: z.number().nonnegative(),
  decisions: z.number().int().nonnegative(),
  /** Positions waiting for the analysis farm. */
  awaiting: z.number().int().nonnegative().default(0),
});
export type TreeStats = z.infer<typeof TreeStatsSchema>;

export const RepertoireTreeSchema = z.object({
  formatVersion: z.literal(1),
  color: z.enum(["w", "b"]),
  settings: TreeSettingsSchema,
  /**
   * `generating` = stopped part-way; `analysing` = waiting for the analysis
   * farm; `decisions` = waiting for your choices; `ready` = complete.
   */
  status: z.enum(["generating", "analysing", "decisions", "ready"]),
  root: z.string(),
  nodes: z.record(z.string(), TreeNodeSchema),
  stats: TreeStatsSchema,
});
export type RepertoireTree = z.infer<typeof RepertoireTreeSchema>;

/** The tree with `choice` set (or cleared) at one of your positions; rebuild after. */
export function withChoice(
  tree: RepertoireTree,
  key: string,
  choice: UserChoice | null,
): RepertoireTree {
  const node = tree.nodes[key];
  if (!node || node.side !== "user") return tree;
  const { choice: _old, ...rest } = node;
  return {
    ...tree,
    nodes: { ...tree.nodes, [key]: choice ? { ...rest, choice } : rest },
  };
}
