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
import {
  RepertoireTreeSchema,
  TreeSettingsSchema,
  TreeStatsSchema,
} from "../../games/chess/trainer/tree.ts";

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
