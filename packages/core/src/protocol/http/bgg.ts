import { z } from "zod";
import { GameSlugSchema } from "../common.ts";

/**
 * Wire schema for BoardGameGeek metadata served by `/api/bgg` and bundled
 * into the web build via `@boardgames/core/bgg`. Single source of truth.
 *
 * Image URLs (`<thumbnail>`, `<image>`) are deliberately NOT in this schema:
 * we only ever render the local optimized webp produced by
 * `pnpm thumbnails`. The bgg-sync `--add` flow downloads BGG's image once
 * during scaffolding and discards the URL.
 *
 * `id === 0` is the homebrew sentinel for games not in BGG's catalog
 * (Chess Bughouse, Elements of Truth, D&D, Durak, …).
 */

/** Generic id+name pair used for game relations (expansions, accessories, …). */
export const RelatedItemSchema = z.object({
  id: z.number().int(),
  name: z.string(),
});
export type RelatedItem = z.infer<typeof RelatedItemSchema>;

/** Per-subdomain rank entry (e.g. Strategy Game Rank, Family Game Rank). */
export const SubdomainRankSchema = z.object({
  name: z.string(),
  friendlyName: z.string(),
  rank: z.number().int().nullable(),
});
export type SubdomainRank = z.infer<typeof SubdomainRankSchema>;

/** Community-recommended player-count window. */
export const RecommendedPlayerCountSchema = z.object({
  min: z.number().int(),
  max: z.number().int(),
});
export type RecommendedPlayerCount = z.infer<typeof RecommendedPlayerCountSchema>;

export const BggGameSchema = z.object({
  // ── Identity ─────────────────────────────────────────────────────────
  id: z.number().int().min(0),
  /** "boardgame", "boardgameexpansion", "boardgameaccessory" — useful
   *  to guard against linking a board-game slug to an expansion id. */
  type: z.string(),

  // ── Names ────────────────────────────────────────────────────────────
  name: z.string().min(1),
  /** All localized titles BGG knows about (German, Russian, Korean, …). */
  alternateNames: z.array(z.string()),

  // ── Prose ────────────────────────────────────────────────────────────
  description: z.string(),

  // ── Year ─────────────────────────────────────────────────────────────
  yearPublished: z.number().int().nullable(),

  // ── Player counts ────────────────────────────────────────────────────
  /** Publisher-stated. */
  minPlayers: z.number().int().nullable(),
  /** Either an integer cap, the literal `"infinity"` for genuinely unbounded
   *  party games (Codenames, Exploding Kittens with extra decks), or `null`
   *  when BGG didn't say. Use `maxPlayersAsNumber` / `formatMaxPlayers`
   *  helpers from `@boardgames/core/bgg` to consume. */
  maxPlayers: z.union([z.number().int(), z.literal("infinity")]).nullable(),
  /** Community-voted "Best with N players" (modal vote in the user poll). */
  bestPlayerCount: z.number().int().nullable(),
  /** Community-voted recommended range — narrower than min/maxPlayers. */
  recommendedPlayerCount: RecommendedPlayerCountSchema.nullable(),

  // ── Time ─────────────────────────────────────────────────────────────
  playingTime: z.number().int().nullable(),
  minPlayTime: z.number().int().nullable(),
  maxPlayTime: z.number().int().nullable(),

  // ── Age ──────────────────────────────────────────────────────────────
  /** Publisher-stated minimum age. */
  minAge: z.number().int().nullable(),
  /** Community-voted suggested age (modal vote — often higher than minAge). */
  suggestedAge: z.number().int().nullable(),

  // ── Language ─────────────────────────────────────────────────────────
  /** 1 = no in-game text, 5 = unplayable in another language. Weighted vote. */
  languageDependence: z.number().int().min(1).max(5).nullable(),

  // ── Taxonomy ─────────────────────────────────────────────────────────
  categories: z.array(z.string()),
  mechanics: z.array(z.string()),
  /** BGG family tags — "Theme: Pirates", "Components: Hexagonal Tiles", etc. */
  families: z.array(z.string()),
  designers: z.array(z.string()),
  artists: z.array(z.string()),
  publishers: z.array(z.string()),

  // ── Game relations ───────────────────────────────────────────────────
  expansions: z.array(RelatedItemSchema),
  compilations: z.array(RelatedItemSchema),
  implementations: z.array(RelatedItemSchema),
  accessories: z.array(RelatedItemSchema),

  // ── Statistics ───────────────────────────────────────────────────────
  averageRating: z.number().nullable(),
  /** BGG's "Geek Rating" — Bayesian-dampened toward the mean. Used for ranks. */
  geekRating: z.number().nullable(),
  averageWeight: z.number().nullable(),
  numRatings: z.number().int().nullable(),
  numComments: z.number().int().nullable(),
  numWeights: z.number().int().nullable(),
  stddev: z.number().nullable(),
  /** Overall BGG rank (1-based). Null when "Not Ranked". */
  bggRank: z.number().int().nullable(),
  /** Per-subdomain ranks (Strategy, Family, Thematic, …). */
  subdomainRanks: z.array(SubdomainRankSchema),
  /** Community ownership signals. */
  owned: z.number().int().nullable(),
  trading: z.number().int().nullable(),
  wanting: z.number().int().nullable(),
  wishing: z.number().int().nullable(),
});
export type BggGame = z.infer<typeof BggGameSchema>;

export const BggSnapshotSchema = z.record(GameSlugSchema, BggGameSchema);
export type BggSnapshot = z.infer<typeof BggSnapshotSchema>;
