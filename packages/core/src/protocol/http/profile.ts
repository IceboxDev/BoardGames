import { z } from "zod";
import { GameSlugSchema } from "../common.ts";
import { MatchRecordSchema } from "./history.ts";

// User profiles aggregate data that already lives in other tables (inventory,
// match_results, calendar) plus a small editable profile row (`user_profiles`).
// Everything here is visible to any logged-in member — there is no per-section
// privacy. See `server/src/auth-routes/profile.ts` for the read/write routes.

// ── Caps (shared by schema + server write validation) ──────────────────
export const PROFILE_TAGLINE_MAX = 120;
export const PROFILE_BIO_MAX = 1000;
export const PROFILE_PRONOUNS_MAX = 40;
export const PROFILE_LOCATION_MAX = 80;
export const PROFILE_FAVORITES_MAX = 12;
export const PROFILE_WISHLIST_MAX = 50;
export const PROFILE_LINKS_MAX = 6;

// ── Primitives ─────────────────────────────────────────────────────────
const DateKeyStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/** `#rrggbb` hex used for the profile's accent (banner gradient + chart fill). */
export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected #rrggbb hex color");
export type HexColor = z.infer<typeof HexColorSchema>;

export const ProfileLinkSchema = z.object({
  label: z.string().min(1).max(40),
  url: z.string().url().max(200),
});
export type ProfileLink = z.infer<typeof ProfileLinkSchema>;

// ── Skill chart (generated later; data-driven) ─────────────────────────
// Axis labels AND values come from a future generator. The web renders a
// ghosted placeholder while this is null. Never user-editable.
export const SkillAxisSchema = z.object({
  label: z.string().min(1).max(24),
  value: z.number().min(0).max(1),
});
export type SkillAxis = z.infer<typeof SkillAxisSchema>;

export const SkillChartSchema = z
  .object({ axes: z.array(SkillAxisSchema).min(3).max(8) })
  .nullable();
export type SkillChart = z.infer<typeof SkillChartSchema>;

// ── Editable profile (read shape == PUT body) ──────────────────────────
export const ProfileEditableSchema = z.object({
  tagline: z.string().max(PROFILE_TAGLINE_MAX).nullable(),
  bio: z.string().max(PROFILE_BIO_MAX).nullable(),
  pronouns: z.string().max(PROFILE_PRONOUNS_MAX).nullable(),
  location: z.string().max(PROFILE_LOCATION_MAX).nullable(),
  accentHex: HexColorSchema.nullable(),
  favorites: z.array(GameSlugSchema).max(PROFILE_FAVORITES_MAX),
  wishlist: z.array(GameSlugSchema).max(PROFILE_WISHLIST_MAX),
  links: z.array(ProfileLinkSchema).max(PROFILE_LINKS_MAX),
});
export type ProfileEditable = z.infer<typeof ProfileEditableSchema>;

/** `PUT /api/profiles/:userId` body. Full-replace, identical to the read shape. */
export const ProfileUpdateInputSchema = ProfileEditableSchema;
export type ProfileUpdateInput = z.infer<typeof ProfileUpdateInputSchema>;

// ── Aggregated public profile ──────────────────────────────────────────
export const ProfileUserSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  role: z.string().nullable(),
  /** `user.createdAt`, normalized to an ISO-8601 string. */
  memberSince: z.string(),
});
export type ProfileUserSummary = z.infer<typeof ProfileUserSummarySchema>;

export const ProfilePerGameStatSchema = z.object({
  slug: GameSlugSchema,
  title: z.string(),
  plays: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
});
export type ProfilePerGameStat = z.infer<typeof ProfilePerGameStatSchema>;

export const ProfileStatsSchema = z.object({
  /** Matches the user took part in (includes non-competing moderator slots). */
  gamesPlayed: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  /** wins / (wins + losses); null when the user has no competitive results. */
  winRate: z.number().min(0).max(1).nullable(),
  gamesOwned: z.number().int().nonnegative(),
  distinctGames: z.number().int().nonnegative(),
  /** Organized (locked) past nights the user RSVP'd yes to. */
  nightsAttended: z.number().int().nonnegative(),
  /** Total board-game nights organized so far (past locked dates). */
  nightsTotal: z.number().int().nonnegative(),
  favoriteGameSlug: GameSlugSchema.nullable(),
  perGame: z.array(ProfilePerGameStatSchema),
});
export type ProfileStats = z.infer<typeof ProfileStatsSchema>;

export const NextNightSchema = z
  .object({
    dateKey: DateKeyStringSchema,
    eventTime: z.string().nullable(),
    address: z.string().nullable(),
    hostName: z.string().nullable(),
    status: z.enum(["definite", "tentative"]),
    attendeeCount: z.number().int().nonnegative(),
  })
  .nullable();
export type NextNight = z.infer<typeof NextNightSchema>;

export const PublicProfileSchema = z.object({
  user: ProfileUserSummarySchema,
  profile: ProfileEditableSchema,
  /** Owned-games library (slugs) from `user_inventory`. */
  library: z.array(GameSlugSchema),
  skill: SkillChartSchema,
  stats: ProfileStatsSchema,
  recentMatches: z.array(MatchRecordSchema),
  nextNight: NextNightSchema,
});
export type PublicProfile = z.infer<typeof PublicProfileSchema>;

// ── Directory (browse all members) ─────────────────────────────────────
export const ProfileDirectoryEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  tagline: z.string().nullable(),
  accentHex: HexColorSchema.nullable(),
  gamesOwned: z.number().int().nonnegative(),
  nextNightDateKey: DateKeyStringSchema.nullable(),
});
export type ProfileDirectoryEntry = z.infer<typeof ProfileDirectoryEntrySchema>;

export const ProfileDirectoryResponseSchema = z.object({
  players: z.array(ProfileDirectoryEntrySchema),
});
export type ProfileDirectoryResponse = z.infer<typeof ProfileDirectoryResponseSchema>;
