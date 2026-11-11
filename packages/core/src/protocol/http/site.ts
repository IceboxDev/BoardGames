import { z } from "zod";

// ── Site hibernation ───────────────────────────────────────────────────
//
// One admin switch freezes the whole site into a goodbye screen. Nothing is
// deleted: accounts, nights, RSVPs and history stay as they were, and waking
// brings everything back. While hibernated, only the online area (games,
// rooms, trainers) stays open, and only to members with online access.

/** The error `code` every gated request answers with while hibernated (503). */
export const HIBERNATED_CODE = "HIBERNATED";

/** One of the group's most-played games, frozen into the memorial. */
export const MemorialGameSchema = z.object({
  slug: z.string().nullable(),
  title: z.string(),
  plays: z.number().int().nonnegative(),
});
export type MemorialGame = z.infer<typeof MemorialGameSchema>;

/** The group's totals, computed once at the moment the site was hibernated. */
export const MemorialSchema = z.object({
  /** Game nights whose date had passed. */
  nights: z.number().int().nonnegative(),
  /** Matches recorded in the offline history. */
  matches: z.number().int().nonnegative(),
  /** Finished online games (solo and rooms). */
  onlineGames: z.number().int().nonnegative(),
  /** Members (guest stubs excluded). */
  members: z.number().int().nonnegative(),
  /** First and last night (YYYY-MM-DD), null when no night was ever held. */
  firstNight: z.string().nullable(),
  lastNight: z.string().nullable(),
  /** Most-played games, offline and online together, most first. */
  topGames: z.array(MemorialGameSchema),
});
export type Memorial = z.infer<typeof MemorialSchema>;

/** `GET /api/site/status` — public; `onlineAccess` is for the caller's session. */
export const SiteStatusSchema = z.object({
  hibernated: z.boolean(),
  /** When the site went to sleep (ISO), null while awake. */
  since: z.string().nullable(),
  memorial: MemorialSchema.nullable(),
  /** The caller may use the online area (online/both mode, or an admin). */
  onlineAccess: z.boolean(),
  /** The caller is an admin. */
  admin: z.boolean(),
});
export type SiteStatus = z.infer<typeof SiteStatusSchema>;

/** `POST /api/admin/site/hibernate` — the admin types the word to confirm. */
export const HibernateBodySchema = z.object({ confirm: z.literal("HIBERNATE") });
export type HibernateBody = z.input<typeof HibernateBodySchema>;

/** One hibernate / wake, newest first in `GET /api/admin/site/log`. */
export const SiteLogEntrySchema = z.object({
  at: z.string(),
  action: z.enum(["hibernate", "wake"]),
  byName: z.string().nullable(),
});
export type SiteLogEntry = z.infer<typeof SiteLogEntrySchema>;

export const SiteLogResponseSchema = z.object({ entries: z.array(SiteLogEntrySchema) });
export type SiteLogResponse = z.infer<typeof SiteLogResponseSchema>;

/** `GET /api/admin/site/preview` — what hibernating now would freeze. */
export const MemorialPreviewResponseSchema = z.object({ memorial: MemorialSchema });
export type MemorialPreviewResponse = z.infer<typeof MemorialPreviewResponseSchema>;
