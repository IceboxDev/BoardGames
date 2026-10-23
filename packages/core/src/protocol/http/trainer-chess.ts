/**
 * Chess opening trainer — `/api/trainers/chess/*`. The browser talks to
 * lichess itself (OAuth, game export, explorer, cloud eval); the server keeps
 * the linked account, the imported games and the member's opening trees.
 */
import { z } from "zod";
import {
  ImportedGameSchema,
  TrainerSpeedSchema,
  UciLineSchema,
} from "../../games/chess/trainer/imported-game.ts";
import { LibrarySchema } from "../../games/chess/trainer/library.ts";
import {
  RepertoireTreeSchema,
  TreeSettingsSchema,
  TreeStatsSchema,
} from "../../games/chess/trainer/tree.ts";
import { DateKeyStringSchema } from "./collection.ts";
import { SrsStateKindSchema } from "./trainer-quiz.ts";

/** Games per upload. */
export const CHESS_GAMES_PER_UPLOAD = 1000;
/** Games per page when the trainer downloads them back. */
export const CHESS_GAMES_PAGE = 5000;

export const ChessColorSchema = z.enum(["w", "b"]);

export const LichessLinkSchema = z.object({
  lichessId: z.string(),
  username: z.string(),
  linkedAt: z.string(),
  gamesCount: z.number().int().nonnegative(),
  /** When the newest imported game was played (ms) — the next import starts after it. */
  newestGameAt: z.number().int().nullable(),
  /** Imported games by the colour you played. */
  byColor: z.object({ w: z.number().int(), b: z.number().int() }),
  bySpeed: z.partialRecord(TrainerSpeedSchema, z.number().int()),
});
export type LichessLink = z.infer<typeof LichessLinkSchema>;

export const ChessLinkResponseSchema = z.object({ link: LichessLinkSchema.nullable() });
export type ChessLinkResponse = z.infer<typeof ChessLinkResponseSchema>;

/** A lichess OAuth token, used once by the server to read who it belongs to. */
export const ChessLinkBodySchema = z.object({ token: z.string().min(8).max(200) });

export const ChessUploadGamesBodySchema = z.object({
  games: z.array(ImportedGameSchema).min(1).max(CHESS_GAMES_PER_UPLOAD),
});
export const ChessUploadGamesResponseSchema = z.object({
  /** New rows (repeats of games already stored are ignored). */
  stored: z.number().int().nonnegative(),
  link: LichessLinkSchema,
});

export const ChessGamesQuerySchema = z.object({
  color: ChessColorSchema,
  /** The `next` of the previous page. */
  cursor: z
    .string()
    .regex(/^\d+:[A-Za-z0-9]{8}$/)
    .optional(),
});

/** A stored game as the tree builder needs it. */
export const ChessTrainerGameSchema = z.object({
  id: z.string(),
  uci: UciLineSchema,
  result: z.enum(["win", "loss", "draw"]),
  speed: TrainerSpeedSchema,
  playedAt: z.number().int(),
});
export type ChessTrainerGame = z.infer<typeof ChessTrainerGameSchema>;

export const ChessGamesPageSchema = z.object({
  games: z.array(ChessTrainerGameSchema),
  next: z.string().nullable(),
});

export const RepertoireSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  color: ChessColorSchema,
  status: z.enum(["new", "generating", "analysing", "decisions", "ready"]),
  stats: TreeStatsSchema.nullable(),
  version: z.number().int().min(1),
  updatedAt: z.string(),
});
export type RepertoireSummary = z.infer<typeof RepertoireSummarySchema>;

export const RepertoireListSchema = z.object({ repertoires: z.array(RepertoireSummarySchema) });

export const RepertoireSchema = RepertoireSummarySchema.extend({
  settings: TreeSettingsSchema,
  /** `null` until the first build checkpoint. */
  tree: RepertoireTreeSchema.nullable(),
});
export type Repertoire = z.infer<typeof RepertoireSchema>;

export const CreateRepertoireBodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: ChessColorSchema,
  settings: TreeSettingsSchema,
});

/** Save a build's tree (or rename). `expectedVersion` guards against a second tab. */
export const UpdateRepertoireBodySchema = z.object({
  expectedVersion: z.number().int().min(1),
  name: z.string().trim().min(1).max(60).optional(),
  settings: TreeSettingsSchema.optional(),
  tree: RepertoireTreeSchema.optional(),
});

/** The member's folders and saved lines (`library.ts`); `version` guards a second tab. */
export const LibraryResponseSchema = z.object({
  library: LibrarySchema,
  /** 0 before the first save. */
  version: z.number().int().min(0),
});
export type LibraryResponse = z.infer<typeof LibraryResponseSchema>;

export const UpdateLibraryBodySchema = z.object({
  expectedVersion: z.number().int().min(0),
  library: LibrarySchema,
});

// ── Drill (your moves, spaced repetition) ─────────────────────────────
//
// One shared-trainer deck per colour (`chess-w`, `chess-b`, migration 0043's
// tables). A card is a position where it is your move in that colour's tree,
// keyed by its position key (`engine/fen.ts:positionKey`); the move to play
// is the tree's, so cards follow the tree as it changes.

export const MAX_CHESS_DRILL_BULK = 200;

/** A position key: placement, side to move, castling, en passant. */
export const ChessCardIdSchema = z
  .string()
  .max(100)
  .regex(
    /^[pnbrqkPNBRQK1-8/]+ [wb] (-|K?Q?k?q?) (-|[a-h][36])$/,
    "Expected a position key like 'rnbqkbnr/… w KQkq -'",
  );

export const ChessDrillGradeSchema = z.enum(["again", "hard", "good", "easy"]);

export const ChessDrillStateSchema = z.object({
  /** The card id (the shared scheduler calls every item a question). */
  questionId: ChessCardIdSchema,
  state: SrsStateKindSchema,
  ease: z.number(),
  intervalDays: z.number().int().nonnegative(),
  dueDate: DateKeyStringSchema,
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  lastReviewedAt: z.string().nullable(),
  leech: z.boolean(),
});
export type ChessDrillStateWire = z.infer<typeof ChessDrillStateSchema>;

export const ChessDrillOverviewQuerySchema = z.object({ today: DateKeyStringSchema });

export const ChessDrillOverviewResponseSchema = z.object({
  states: z.array(ChessDrillStateSchema),
  today: z.object({
    reviews: z.number().int().nonnegative(),
    correct: z.number().int().nonnegative(),
  }),
  /** Cards answered for the first time today (the new-card budget's use). */
  introducedToday: z.number().int().nonnegative(),
  streak: z.object({
    current: z.number().int().nonnegative(),
    longest: z.number().int().nonnegative(),
    studiedToday: z.boolean(),
  }),
  /** Share of non-"again" answers on review cards over the last 30 days, or null. */
  retention30: z.number().min(0).max(1).nullable(),
});
export type ChessDrillOverview = z.infer<typeof ChessDrillOverviewResponseSchema>;

/** What the answer was, kept for later analysis. */
export const ChessDrillOutcomeSchema = z.object({
  /** The move you played, or null when you asked to see it. */
  played: z.string().max(5).nullable(),
  expected: z.string().min(4).max(5),
  hinted: z.boolean(),
});

export const ChessDrillReviewBodySchema = z.object({
  clientId: z.string().min(8).max(64),
  color: ChessColorSchema,
  cardId: ChessCardIdSchema,
  grade: ChessDrillGradeSchema,
  localDate: DateKeyStringSchema,
  durationMs: z.number().int().min(0).max(600_000).nullable().optional(),
  reviewedAt: z.string().datetime({ offset: true }).optional(),
  /** "drill": free practice; only reschedules a card that is due anyway. */
  source: z.enum(["trainer", "drill"]).default("trainer"),
  outcome: ChessDrillOutcomeSchema,
});
export type ChessDrillReviewBody = z.input<typeof ChessDrillReviewBodySchema>;

export const ChessDrillReviewResponseSchema = z.object({
  ok: z.literal(true),
  existed: z.boolean(),
  applied: z.boolean(),
  state: ChessDrillStateSchema.nullable(),
});

export const ChessDrillBulkReviewsBodySchema = z.object({
  reviews: z.array(ChessDrillReviewBodySchema).min(1).max(MAX_CHESS_DRILL_BULK),
});
export const ChessDrillBulkReviewsResponseSchema = z.object({
  ok: z.literal(true),
  applied: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  states: z.array(ChessDrillStateSchema),
});

// ── Explorer cache (lichess database answers, shared) ─────────────────
//
// lichess allows about one explorer request every three seconds, so each
// position is fetched once and kept on the server for everyone
// (`chess_explorer_cache`, migration 0064): the browser asks here first,
// fetches only the misses from lichess, and saves them back.

export const MAX_EXPLORER_LOOKUP = 200;
export const MAX_EXPLORER_SAVE = 50;

export const ExplorerMoveSchema = z.object({
  uci: z.string().min(4).max(5),
  white: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  black: z.number().int().nonnegative(),
});

export const ExplorerAnswerSchema = z.object({
  /** Games that reached the position. */
  games: z.number().int().nonnegative(),
  /** Its moves, most played first. */
  moves: z.array(ExplorerMoveSchema).max(40),
});
export type ExplorerAnswer = z.infer<typeof ExplorerAnswerSchema>;

export const ChessExplorerLookupBodySchema = z.object({
  fens: z.array(z.string().min(10).max(100)).min(1).max(MAX_EXPLORER_LOOKUP),
});
export const ChessExplorerLookupResponseSchema = z.object({
  /** Known answers, keyed by the request's FEN; the rest are misses. */
  results: z.record(z.string(), ExplorerAnswerSchema.extend({ fetchedAt: z.string() })),
});

export const ChessExplorerSaveBodySchema = z.object({
  entries: z
    .array(ExplorerAnswerSchema.extend({ fen: z.string().min(10).max(100) }))
    .min(1)
    .max(MAX_EXPLORER_SAVE),
});
export const ChessExplorerSaveResponseSchema = z.object({
  ok: z.literal(true),
  saved: z.number().int().nonnegative(),
});
