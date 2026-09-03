import { z } from "zod";
import { isCatalogSlug } from "../../games/catalog.ts";
import { GameSlugSchema } from "../common.ts";

// ── "Vote for the next game purchase" poll ─────────────────────────────
//
// One admin-configured poll at a time over a set of catalog games. Every
// player spends up to VOTES_PER_PLAYER votes, each on a DISTINCT game; the
// poll auto-closes the instant the required number of distinct voters is
// reached. While the poll is open the per-game tally is deliberately absent
// from the player payload (only participation progress is public — same
// anti-bandwagon reasoning as the carousel hiding reaction counts); the full
// tally is revealed to everyone once closed. The admin payload always
// carries the live tally.

export const VOTES_PER_PLAYER = 3;

/** One revealed tally row. Slugs stay unrefined on the read path so a game
 * later removed from the catalog never makes a stored poll unreadable. */
export const PurchaseTallyEntrySchema = z.object({
  slug: z.string().min(1),
  votes: z.number().int().min(0),
});
export type PurchaseTallyEntry = z.infer<typeof PurchaseTallyEntrySchema>;

export const PurchasePollSchema = z.object({
  id: z.number().int().positive(),
  /** Candidate slugs, in the admin's order. Unrefined on read. */
  candidates: z.array(z.string().min(1)).min(1),
  requiredVoters: z.number().int().min(1),
  /** Distinct players who have cast at least one vote. */
  voterCount: z.number().int().min(0),
  /** The viewer's own picks. */
  myVotes: z.array(z.string().min(1)).max(VOTES_PER_PLAYER),
  votesLeft: z.number().int().min(0).max(VOTES_PER_PLAYER),
  /** SQLite `datetime('now')` UTC string; null while the poll is open. */
  closedAt: z.string().min(1).nullable(),
  winnerSlug: z.string().min(1).nullable(),
  /** Full tally — non-null ONLY once the poll is closed. */
  results: z.object({ tally: z.array(PurchaseTallyEntrySchema) }).nullable(),
});
export type PurchasePoll = z.infer<typeof PurchasePollSchema>;

/** `GET /api/purchase-vote` response. `poll` is null when none was ever opened. */
export const PurchaseVoteStateSchema = z.object({
  poll: PurchasePollSchema.nullable(),
});
export type PurchaseVoteState = z.infer<typeof PurchaseVoteStateSchema>;

/** `PUT /api/purchase-vote/votes` body — REPLACES the viewer's whole vote set
 * in one submit (the voting screen collects picks locally and saves once).
 * Distinctness enforced here; candidate membership lives in the route. */
export const SetPurchaseVotesBodySchema = z.object({
  slugs: z
    .array(GameSlugSchema)
    .max(VOTES_PER_PLAYER)
    .superRefine((slugs, ctx) => {
      const seen = new Set<string>();
      slugs.forEach((slug, i) => {
        if (seen.has(slug)) {
          ctx.addIssue({ code: "custom", path: [i], message: `Duplicate vote "${slug}"` });
        }
        seen.add(slug);
      });
    }),
});
export type SetPurchaseVotesBody = z.infer<typeof SetPurchaseVotesBodySchema>;

export const PurchaseVoteWriteResponseSchema = z.object({ ok: z.literal(true) });

// ── Admin: /api/admin/purchase-vote ────────────────────────────────────

export const PurchaseVoterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Avatar as a webp data URI (see avatar.ts), or null for the monogram. */
  image: z.string().nullable(),
});

/** Admin-only tally row: voter ids in vote-time order, so the card can show
 * WHO voted. Deliberately not on the shared entry — the player-facing reveal
 * and the result greeting must never carry voter identity. */
export const AdminPurchaseTallyEntrySchema = PurchaseTallyEntrySchema.extend({
  voterIds: z.array(z.string().min(1)),
});
export type AdminPurchaseTallyEntry = z.infer<typeof AdminPurchaseTallyEntrySchema>;

export const AdminPurchasePollSchema = z.object({
  id: z.number().int().positive(),
  createdAt: z.string().min(1),
  candidates: z.array(z.string().min(1)).min(1),
  requiredVoters: z.number().int().min(1),
  voterCount: z.number().int().min(0),
  closedAt: z.string().min(1).nullable(),
  winnerSlug: z.string().min(1).nullable(),
  /** Live tally, open or closed — the admin always sees the numbers. */
  tally: z.array(AdminPurchaseTallyEntrySchema),
  voters: z.array(PurchaseVoterSchema),
});
export type AdminPurchasePoll = z.infer<typeof AdminPurchasePollSchema>;

export const AdminPurchaseVoteStateSchema = z.object({
  poll: AdminPurchasePollSchema.nullable(),
});
export type AdminPurchaseVoteState = z.infer<typeof AdminPurchaseVoteStateSchema>;

/** `POST /api/admin/purchase-vote` body. Write path enforces catalog
 * membership and uniqueness; at least two games make a vote meaningful. */
export const AdminCreatePollBodySchema = z.object({
  candidates: z
    .array(GameSlugSchema)
    .min(2)
    .max(30)
    .superRefine((slugs, ctx) => {
      const seen = new Set<string>();
      slugs.forEach((slug, i) => {
        if (!isCatalogSlug(slug)) {
          ctx.addIssue({ code: "custom", path: [i], message: `Unknown catalog slug "${slug}"` });
        }
        if (seen.has(slug)) {
          ctx.addIssue({ code: "custom", path: [i], message: `Duplicate candidate "${slug}"` });
        }
        seen.add(slug);
      });
    }),
  requiredVoters: z.number().int().min(1).max(99),
});
export type AdminCreatePollBody = z.infer<typeof AdminCreatePollBodySchema>;

export const AdminPurchaseVoteWriteResponseSchema = z.object({ ok: z.literal(true) });
