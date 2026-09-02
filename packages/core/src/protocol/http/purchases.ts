import { z } from "zod";
import { GameSlugSchema } from "../common.ts";

// Purchase manager (`/u/:userId/collection?tab=purchases`) — a read-only
// display surface over crowdfunding pledges and preorders. The data itself is
// NOT database-backed: it lives in the checked-in module
// `@boardgames/core/purchases/data`, maintained code-side (the owner hands
// campaign posts to a Claude session, which folds them in and ships). The
// server only reads that module, nulls the private fields for non-owners, and
// serves it through these schemas — there are no write endpoints.

const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/**
 * Crowdfunding ETAs come at month granularity ("arriving Nov 2026"). The
 * YYYY-MM shape sorts lexicographically in chronological order, so slip math
 * and overdue checks are plain string compares.
 */
export const EtaMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected YYYY-MM");

/**
 * Stored, user-facing link. Unlike profile links, these render as prominent
 * CTAs on another member's page, so the scheme is pinned at the boundary —
 * `z.string().url()` alone would let `javascript:` through.
 */
export const HttpUrlSchema = z
  .string()
  .url()
  .max(500)
  .refine((u) => /^https?:\/\//i.test(u), "must be an http(s) URL");

/**
 * Which pipeline a purchase runs: a crowdfunding pledge (fundraising →
 * production → shipping → delivered) or a retail preorder (preorder →
 * shipping → delivered). Statuses overlap, so the kind is explicit — it's
 * what lets the progress rail know which stages ever existed.
 */
export const PurchaseKindSchema = z.enum(["crowdfunding", "retail"]);
export type PurchaseKind = z.infer<typeof PurchaseKindSchema>;

/**
 * Where a purchase sits in its pipeline. Crowdfunding path: fundraising →
 * production → shipping → delivered. Retail path: preorder → shipping →
 * delivered. `cancelled` is terminal from anywhere (campaign failed, order
 * refunded). A late pledge is just `production` plus a note — no extra state.
 */
export const PurchaseStatusSchema = z.enum([
  "fundraising",
  "preorder",
  "production",
  "shipping",
  "delivered",
  "cancelled",
]);
export type PurchaseStatus = z.infer<typeof PurchaseStatusSchema>;

export const PurchaseEventTypeSchema = z.enum([
  "status-change",
  "campaign-update",
  "shipping-notice",
  "delay",
  "note",
]);
export type PurchaseEventType = z.infer<typeof PurchaseEventTypeSchema>;

/**
 * One dated fact on a purchase's timeline — a campaign update digest, a
 * shipping notice, a status move, a delay announcement, or an owner note.
 * `occurredOn` is the post's own stated date: hand-authored data has no
 * meaningful `createdAt`, so the semantic date is the only axis.
 */
export const PurchaseEventSchema = z.object({
  id: z.string().min(1),
  occurredOn: DateStringSchema,
  type: PurchaseEventTypeSchema,
  title: z.string().min(1).max(140),
  /** 1–3 sentence factual summary of what the source post actually said. */
  details: z.string().max(2000).nullable(),
  /** Link to the update post the event was digested from. */
  sourceUrl: HttpUrlSchema.nullable(),
});
export type PurchaseEvent = z.infer<typeof PurchaseEventSchema>;

/**
 * One tracked purchase. `slug` optionally links a catalog game (thumbnail and
 * BGG identity come along); free-text `title` always names the physical thing
 * bought. `originalEtaMonth` is the first promised ETA and is never edited
 * after creation — `currentEtaMonth` moves with each new promise, and the
 * client derives the slip from the pair. Private fields (`pledgedOn`,
 * `pledgeCents`, `shippingCents`, `note`) are nulled server-side for viewers
 * other than the owner and admins; everything else (status, ETAs, URLs, the
 * timeline) is deliberately member-visible.
 */
export const PurchaseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(140),
  slug: GameSlugSchema.nullable(),
  kind: PurchaseKindSchema,
  status: PurchaseStatusSchema,
  /** "Kickstarter", "Gamefound", a shop name — display-only provenance. */
  platform: z.string().max(60).nullable(),
  /** The campaign / product page where updates are published. */
  campaignUrl: HttpUrlSchema.nullable(),
  /** The pledge manager or shop order page — a different job than the campaign. */
  pledgeManagerUrl: HttpUrlSchema.nullable(),
  originalEtaMonth: EtaMonthSchema.nullable(),
  currentEtaMonth: EtaMonthSchema.nullable(),
  pledgedOn: DateStringSchema.nullable(),
  deliveredOn: DateStringSchema.nullable(),
  /** EUR cents, like `pricePaidCents` on collection items. */
  pledgeCents: z.number().int().nonnegative().max(10_000_000).nullable(),
  shippingCents: z.number().int().nonnegative().max(10_000_000).nullable(),
  note: z.string().max(2000).nullable(),
  /** Timeline, kept ascending by `occurredOn` in the data module. */
  events: z.array(PurchaseEventSchema).max(100),
});
export type Purchase = z.infer<typeof PurchaseSchema>;

// ── GET /api/purchases/users/:userId ───────────────────────────────────

export const PurchasesResponseSchema = z.object({
  ownerId: z.string(),
  /** True when the viewer is the owner or an admin — private fields un-nulled. */
  editable: z.boolean(),
  purchases: z.array(PurchaseSchema).max(100),
});
export type PurchasesResponse = z.infer<typeof PurchasesResponseSchema>;
