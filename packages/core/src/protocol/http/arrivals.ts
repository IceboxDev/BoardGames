import { z } from "zod";
import { GameSlugSchema } from "../common.ts";
import { AdminPurchaseTallyEntrySchema } from "./purchase-vote.ts";
import { SkillPlayerRefSchema } from "./skills.ts";

// ── Arrivals: "the games from the purchase vote are here" ─────────────
//
// A purchase poll closing is silent for members. The celebration comes
// later, when the physical boxes exist: an admin composes an ARRIVAL from a
// closed poll — one to three of its candidates, who bought each, and a
// real-world photo of each — and publishes it. Publishing stamps every game
// onto its purchaser's inventory and makes a one-shot `arrival` greeting
// available to every offline-enabled member (see greetings.ts).
//
// Voter privacy: the greeting shows the people who voted for each game as
// FACES ONLY. `ArrivalVoterFaceSchema` is a strict object with an image and
// an accent and nothing else — a server that accidentally spreads a user
// row into it fails its own `Schema.parse` before the payload leaves.

export const ARRIVAL_GAMES_MAX = 3;

/** Upload cap on the data-URI STRING (~6 MB of image). The client downscales
 * to ≤2000px first (web `lib/downscale-image.ts`); the server re-encodes to a
 * bounded 4:5 webp regardless. */
export const ARRIVAL_PHOTO_UPLOAD_MAX_CHARS = 8_000_000;

export const ArrivalPhotoUploadSchema = z
  .string()
  .regex(/^data:image\/(png|jpe?g|webp);base64,/, "Expected an image data URI")
  .max(ARRIVAL_PHOTO_UPLOAD_MAX_CHARS, "Photo is too large");

/** The tiny blurred stand-in painted before the real photo loads. */
export const ArrivalPlaceholderSchema = z
  .string()
  .regex(/^data:image\/webp;base64,/)
  .max(4_000);

const AccentHexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** A voter's face only: the avatar (or null → silhouette) tinted by their
 * accent. Strict on purpose — no id, no name, ever. */
export const ArrivalVoterFaceSchema = z.strictObject({
  image: z.string().nullable(),
  accentHex: AccentHexSchema.nullable(),
});
export type ArrivalVoterFace = z.infer<typeof ArrivalVoterFaceSchema>;

export const ArrivalPurchaserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  image: z.string().nullable(),
  accentHex: AccentHexSchema.nullable(),
});
export type ArrivalPurchaser = z.infer<typeof ArrivalPurchaserSchema>;

/** Path of the photo route, without the API origin — the client prefixes
 * it with `apiUrl()`. Arrivals are immutable (retract = delete, republish =
 * new id), so the path doubles as a forever cache key. */
const ArrivalPhotoPathSchema = z.string().regex(/^\/api\/arrivals\/[^/]+\/photos\/[^/?]+$/);

export const ArrivalGameSchema = z.object({
  /** Unrefined on read (like tally rows): title and accent are resolved from
   * the catalog client-side, and a retired slug must not brick the popup. */
  slug: z.string().min(1),
  purchaser: ArrivalPurchaserSchema,
  votes: z.number().int().min(0),
  /** In vote-time order. The UI caps the ring at eight and shows "+N". */
  voters: z.array(ArrivalVoterFaceSchema),
  photoUrl: ArrivalPhotoPathSchema,
  placeholder: ArrivalPlaceholderSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type ArrivalGame = z.infer<typeof ArrivalGameSchema>;

export const ArrivalGreetingSchema = z.object({
  kind: z.literal("arrival"),
  arrivalId: z.string().min(1),
  pollId: z.number().int().positive(),
  /** SQLite `datetime('now')` UTC string. */
  publishedAt: z.string().min(1),
  games: z.array(ArrivalGameSchema).min(1).max(ARRIVAL_GAMES_MAX),
  totals: z.object({
    /** Distinct members who voted in the poll at all. */
    voterCount: z.number().int().min(0),
    /** Every vote cast in the poll, across all candidates. */
    votesCast: z.number().int().min(0),
  }),
});
export type ArrivalGreeting = z.infer<typeof ArrivalGreetingSchema>;

// ── Admin: /api/admin/arrivals ─────────────────────────────────────────

const ArrivalGameInputSchema = z.object({
  slug: GameSlugSchema,
  purchaserUserId: z.string().min(1),
  photo: ArrivalPhotoUploadSchema,
});

/** `POST /api/admin/arrivals` body. Candidate membership, poll state and
 * purchaser eligibility are route-level checks. */
export const PublishArrivalBodySchema = z.object({
  pollId: z.number().int().positive(),
  games: z
    .array(ArrivalGameInputSchema)
    .min(1)
    .max(ARRIVAL_GAMES_MAX)
    .superRefine((games, ctx) => {
      const seen = new Set<string>();
      games.forEach((game, i) => {
        if (seen.has(game.slug)) {
          ctx.addIssue({
            code: "custom",
            path: [i, "slug"],
            message: `Duplicate game "${game.slug}"`,
          });
        }
        seen.add(game.slug);
      });
    }),
});
export type PublishArrivalBody = z.infer<typeof PublishArrivalBodySchema>;

export const PublishArrivalResponseSchema = z.object({
  ok: z.literal(true),
  arrivalId: z.string().min(1),
});
export type PublishArrivalResponse = z.infer<typeof PublishArrivalResponseSchema>;

export const AdminArrivalGameSchema = z.object({
  slug: z.string().min(1),
  purchaserUserId: z.string().min(1),
  votes: z.number().int().min(0),
  photoUrl: ArrivalPhotoPathSchema,
  placeholder: ArrivalPlaceholderSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  photoBytes: z.number().int().min(0),
});
export type AdminArrivalGame = z.infer<typeof AdminArrivalGameSchema>;

export const AdminArrivalSchema = z.object({
  id: z.string().min(1),
  pollId: z.number().int().positive(),
  publishedAt: z.string().min(1),
  /** Null once the publishing admin's account is gone. */
  publishedBy: z.string().min(1).nullable(),
  /** Members who have dismissed or followed the popup. */
  seenBy: z.number().int().min(0),
  games: z.array(AdminArrivalGameSchema).min(1),
});
export type AdminArrival = z.infer<typeof AdminArrivalSchema>;

/** A closed poll the composer can announce from. The admin tally (with
 * voter ids) drives the winner preselect, the vote counts and the face
 * stacks; `arrivedSlugs` marks candidates already announced. */
export const AdminArrivalPollSchema = z.object({
  id: z.number().int().positive(),
  createdAt: z.string().min(1),
  closedAt: z.string().min(1),
  winnerSlug: z.string().min(1).nullable(),
  candidates: z.array(z.string().min(1)).min(1),
  voterCount: z.number().int().min(0),
  tally: z.array(AdminPurchaseTallyEntrySchema),
  arrivedSlugs: z.array(z.string().min(1)),
});
export type AdminArrivalPoll = z.infer<typeof AdminArrivalPollSchema>;

/** `GET /api/admin/arrivals` response. */
export const AdminArrivalsStateSchema = z.object({
  /** Closed polls only, newest first. The composer defaults to the first. */
  polls: z.array(AdminArrivalPollSchema),
  /** Newest first. */
  arrivals: z.array(AdminArrivalSchema),
  /** Name/image for every voter, purchaser and publisher id above. Admin
   * surface only — the member-facing greeting never carries this map. */
  players: z.record(z.string(), SkillPlayerRefSchema),
});
export type AdminArrivalsState = z.infer<typeof AdminArrivalsStateSchema>;

/** `DELETE /api/admin/arrivals/:id` response. */
export const RetractArrivalResponseSchema = z.object({ ok: z.literal(true) });
