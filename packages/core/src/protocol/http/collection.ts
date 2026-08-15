import { z } from "zod";
import { isLegacyDestructible } from "../../games/legacy-games.ts";
import { GameSlugSchema } from "../common.ts";
import { OwnableSlugSchema, SlugListSchema } from "./inventory.ts";

// Collection manager (`/u/:userId/collection`) — per-item metadata over the
// owned-games list, plus the "announce new ownership" queue.
//
// Ownership itself stays in `user_inventory.game_slugs_json`; the tables
// behind these schemas (`collection_items`, `storage_boxes`, per-user
// `sleeve_types` / `collection_statuses`, `ownership_announcements`) only
// decorate it. Read shapes are LENIENT on slugs (a retired slug must not make
// a stored row unreadable); write bodies use `OwnableSlugSchema`.

const DateKeyStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

// ── Vocabulary (per-user) ──────────────────────────────────────────────

export const SleeveStatusSchema = z.enum(["none", "sleeved", "missing"]);
export type SleeveStatus = z.infer<typeof SleeveStatusSchema>;

export const SleeveTypeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  widthMm: z.number().int().positive().nullable(),
  heightMm: z.number().int().positive().nullable(),
  brand: z.string().max(60).nullable(),
});
export type SleeveType = z.infer<typeof SleeveTypeSchema>;

export const CollectionStatusSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(40),
  sortOrder: z.number().int(),
});
export type CollectionStatus = z.infer<typeof CollectionStatusSchema>;

export const StorageBoxSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  note: z.string().max(500).nullable(),
});
export type StorageBox = z.infer<typeof StorageBoxSchema>;

// ── Items ──────────────────────────────────────────────────────────────

/**
 * Per-item metadata row. Exactly one of `slug` / `customTitle` is set:
 * `slug` for anything ownable, `customTitle` for a free-text game an admin
 * approved as custom. `playedThroughAt` marks a destroyed legacy game whose
 * slug has left the inventory; the row remains as the historical record.
 * Private fields (`acquiredOn`, `pricePaidCents`, `note`) are nulled
 * server-side for viewers other than the owner and admins.
 */
export const CollectionItemSchema = z.object({
  id: z.string().min(1),
  slug: GameSlugSchema.nullable(),
  customTitle: z.string().nullable(),
  boxId: z.string().nullable(),
  sleeveStatus: SleeveStatusSchema,
  sleeveTypeId: z.string().nullable(),
  statusId: z.string().nullable(),
  widthMm: z.number().int().positive().nullable(),
  depthMm: z.number().int().positive().nullable(),
  heightMm: z.number().int().positive().nullable(),
  weightG: z.number().int().positive().nullable(),
  language: z.string().nullable(),
  acquiredOn: DateKeyStringSchema.nullable(),
  pricePaidCents: z.number().int().nonnegative().nullable(),
  note: z.string().nullable(),
  playedThroughAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type CollectionItem = z.infer<typeof CollectionItemSchema>;

/** Derived play data per owned slug (from match_results ⋈ match_participants). */
export const PlayStatSchema = z.object({
  slug: GameSlugSchema,
  playCount: z.number().int().nonnegative(),
  lastPlayedAt: z.string().nullable(),
});
export type PlayStat = z.infer<typeof PlayStatSchema>;

// ── Announcements ──────────────────────────────────────────────────────

export const AnnouncementStatusSchema = z.enum(["pending", "approved", "dismissed"]);
export type AnnouncementStatus = z.infer<typeof AnnouncementStatusSchema>;

export const AnnouncementSchema = z.object({
  id: z.string().min(1),
  userId: z.string(),
  /** Joined display name — present on admin reads, null elsewhere. */
  userName: z.string().nullable(),
  slug: GameSlugSchema.nullable(),
  freeTextName: z.string().nullable(),
  note: z.string().nullable(),
  status: AnnouncementStatusSchema,
  /** What the admin actually stamped (may differ from the announced slug). */
  resolutionSlug: GameSlugSchema.nullable(),
  resolvedBy: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Announcement = z.infer<typeof AnnouncementSchema>;

// ── GET /api/collection/users/:userId ──────────────────────────────────

export const CollectionResponseSchema = z.object({
  ownerId: z.string(),
  /** True when the viewer is the owner or an admin. */
  editable: z.boolean(),
  /** The raw stored inventory (catalog slugs, EXIT boxes, deck pseudo-slugs). */
  slugs: SlugListSchema,
  items: z.array(CollectionItemSchema),
  boxes: z.array(StorageBoxSchema),
  sleeveTypes: z.array(SleeveTypeSchema),
  statuses: z.array(CollectionStatusSchema),
  playStats: z.array(PlayStatSchema),
  /** Owner's announcements — empty unless the viewer is owner/admin. */
  announcements: z.array(AnnouncementSchema),
});
export type CollectionResponse = z.infer<typeof CollectionResponseSchema>;

// ── Item upsert ────────────────────────────────────────────────────────

const ItemPatchSchema = z.object({
  boxId: z.string().min(1).nullable().optional(),
  sleeveStatus: SleeveStatusSchema.optional(),
  sleeveTypeId: z.string().min(1).nullable().optional(),
  statusId: z.string().min(1).nullable().optional(),
  widthMm: z.number().int().positive().max(2000).nullable().optional(),
  depthMm: z.number().int().positive().max(2000).nullable().optional(),
  heightMm: z.number().int().positive().max(2000).nullable().optional(),
  weightG: z.number().int().positive().max(50_000).nullable().optional(),
  language: z.string().max(40).nullable().optional(),
  acquiredOn: DateKeyStringSchema.nullable().optional(),
  pricePaidCents: z.number().int().nonnegative().max(10_000_000).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});

/**
 * `PUT /users/:userId/item` body — target exactly one of `slug` (owned game,
 * row materialized on first write) or `itemId` (existing row, incl. custom
 * items and played-through records). Omitted patch fields stay unchanged.
 */
export const UpsertItemBodySchema = ItemPatchSchema.extend({
  slug: OwnableSlugSchema.optional(),
  itemId: z.string().min(1).optional(),
}).superRefine((v, ctx) => {
  if ((v.slug === undefined) === (v.itemId === undefined)) {
    ctx.addIssue({
      code: "custom",
      path: ["slug"],
      message: "provide exactly one of slug or itemId",
    });
  }
  if (v.sleeveStatus === "none" && v.sleeveTypeId != null) {
    ctx.addIssue({
      code: "custom",
      path: ["sleeveTypeId"],
      message: "an unsleeved game cannot carry a sleeve type",
    });
  }
});
export type UpsertItemBody = z.infer<typeof UpsertItemBodySchema>;

export const UpsertItemResponseSchema = z.object({
  ok: z.literal(true),
  item: CollectionItemSchema,
});
export type UpsertItemResponse = z.infer<typeof UpsertItemResponseSchema>;

// ── Played-through / self-remove ───────────────────────────────────────

/** `POST /users/:userId/played-through` — legacy (destroy-on-play) games only. */
export const SetPlayedThroughBodySchema = z
  .object({
    slug: OwnableSlugSchema,
    playedThrough: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (!isLegacyDestructible(v.slug)) {
      ctx.addIssue({
        code: "custom",
        path: ["slug"],
        message: `"${v.slug}" is not a destroy-on-play game`,
      });
    }
  });
export type SetPlayedThroughBody = z.infer<typeof SetPlayedThroughBodySchema>;

export const SetPlayedThroughResponseSchema = z.object({
  ok: z.literal(true),
  slugs: SlugListSchema,
  item: CollectionItemSchema,
});
export type SetPlayedThroughResponse = z.infer<typeof SetPlayedThroughResponseSchema>;

/** `POST /users/:userId/remove` — sold/gifted; drops slug AND metadata row. */
export const RemoveOwnedGameBodySchema = z.object({ slug: OwnableSlugSchema });
export type RemoveOwnedGameBody = z.infer<typeof RemoveOwnedGameBodySchema>;

export const RemoveOwnedGameResponseSchema = z.object({
  ok: z.literal(true),
  slugs: SlugListSchema,
});
export type RemoveOwnedGameResponse = z.infer<typeof RemoveOwnedGameResponseSchema>;

// ── Boxes ──────────────────────────────────────────────────────────────

export const CreateBoxBodySchema = z.object({
  name: z.string().min(1).max(80),
  note: z.string().max(500).nullable().optional(),
});
export type CreateBoxBody = z.infer<typeof CreateBoxBodySchema>;

export const UpdateBoxBodySchema = CreateBoxBodySchema.partial();
export type UpdateBoxBody = z.infer<typeof UpdateBoxBodySchema>;

export const BoxWriteResponseSchema = z.object({
  ok: z.literal(true),
  box: StorageBoxSchema,
});
export type BoxWriteResponse = z.infer<typeof BoxWriteResponseSchema>;

// ── Vocabulary CRUD (per-user) ─────────────────────────────────────────

export const CreateSleeveTypeBodySchema = z.object({
  name: z.string().min(1).max(60),
  widthMm: z.number().int().positive().max(300).nullable().optional(),
  heightMm: z.number().int().positive().max(300).nullable().optional(),
  brand: z.string().max(60).nullable().optional(),
});
export type CreateSleeveTypeBody = z.infer<typeof CreateSleeveTypeBodySchema>;

export const UpdateSleeveTypeBodySchema = CreateSleeveTypeBodySchema.partial();
export type UpdateSleeveTypeBody = z.infer<typeof UpdateSleeveTypeBodySchema>;

export const SleeveTypeWriteResponseSchema = z.object({
  ok: z.literal(true),
  sleeveType: SleeveTypeSchema,
});
export type SleeveTypeWriteResponse = z.infer<typeof SleeveTypeWriteResponseSchema>;

export const CreateStatusBodySchema = z.object({
  label: z.string().min(1).max(40),
  sortOrder: z.number().int().optional(),
});
export type CreateStatusBody = z.infer<typeof CreateStatusBodySchema>;

export const UpdateStatusBodySchema = CreateStatusBodySchema.partial();
export type UpdateStatusBody = z.infer<typeof UpdateStatusBodySchema>;

export const StatusWriteResponseSchema = z.object({
  ok: z.literal(true),
  status: CollectionStatusSchema,
});
export type StatusWriteResponse = z.infer<typeof StatusWriteResponseSchema>;

/** Shared `{ ok: true }` for deletes (boxes, vocab, announcement retract). */
export const CollectionOkResponseSchema = z.object({ ok: z.literal(true) });
export type CollectionOkResponse = z.infer<typeof CollectionOkResponseSchema>;

// ── Announce / resolve ─────────────────────────────────────────────────

/** `POST /api/announcements` — exactly one of `slug` / `freeTextName`. */
export const CreateAnnouncementBodySchema = z
  .object({
    slug: OwnableSlugSchema.optional(),
    freeTextName: z.string().min(2).max(120).optional(),
    note: z.string().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.slug === undefined) === (v.freeTextName === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["slug"],
        message: "provide exactly one of slug or freeTextName",
      });
    }
  });
export type CreateAnnouncementBody = z.infer<typeof CreateAnnouncementBodySchema>;

export const CreateAnnouncementResponseSchema = z.object({
  ok: z.literal(true),
  announcement: AnnouncementSchema,
});
export type CreateAnnouncementResponse = z.infer<typeof CreateAnnouncementResponseSchema>;

/** `GET /api/admin/announcements` — pending only, `userName` joined. */
export const AdminAnnouncementsResponseSchema = z.object({
  announcements: z.array(AnnouncementSchema),
});
export type AdminAnnouncementsResponse = z.infer<typeof AdminAnnouncementsResponseSchema>;

/**
 * `POST /api/admin/announcements/:id/resolve`. `approve` carries the slug
 * being stamped (defaulted client-side from the announcement); `approve-custom`
 * turns a free-text announcement into a custom collection item; `dismiss`
 * just closes it.
 */
export const ResolveAnnouncementBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), slug: OwnableSlugSchema }),
  z.object({ action: z.literal("approve-custom") }),
  z.object({ action: z.literal("dismiss") }),
]);
export type ResolveAnnouncementBody = z.infer<typeof ResolveAnnouncementBodySchema>;

export const ResolveAnnouncementResponseSchema = z.object({ ok: z.literal(true) });
export type ResolveAnnouncementResponse = z.infer<typeof ResolveAnnouncementResponseSchema>;
