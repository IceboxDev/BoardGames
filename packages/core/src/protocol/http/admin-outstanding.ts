// What each member still owes the group, for the admin's availability drawer
// and the users table's chase-list count. Computed server-side in one pass
// (`server/src/lib/member-outstanding.ts`, rules in
// `core/src/availability/outstanding.ts`), plus the admin's own free-text
// notes on what else they believe is outstanding (migration 0071).

import { z } from "zod";
import { NightKeyStringSchema } from "../common.ts";

/** A night the item is about: its key and the private night's title, if any. */
const NightRef = {
  dateKey: NightKeyStringSchema,
  title: z.string().nullable(),
};

export const OutstandingItemSchema = z.discriminatedUnion("kind", [
  /**
   * An open night they're on (marked can, said yes, or were expected) that
   * they never confirmed by hand — `maybe` = they only marked maybe.
   */
  z.object({ kind: z.literal("rsvp"), ...NightRef, reason: z.enum(["unconfirmed", "maybe"]) }),
  /** A private night's invitation with no answer yet. */
  z.object({ kind: z.literal("invite"), ...NightRef }),
  /** A night still voting where their picks count and they hyped nothing. */
  z.object({ kind: z.literal("vote"), ...NightRef }),
  /** Votes cast when the night's headcount was different. */
  z.object({
    kind: z.literal("stale-votes"),
    ...NightRef,
    count: z.number().int().positive(),
  }),
  /** An EXIT night with no box picked yet. */
  z.object({ kind: z.literal("exit-vote"), ...NightRef }),
  /** The open purchase poll: votes they still have to cast. */
  z.object({
    kind: z.literal("purchase-vote"),
    pollId: z.number().int(),
    title: z.string().nullable(),
    votesLeft: z.number().int().positive(),
    votesTotal: z.number().int().positive(),
  }),
  /** A night they host that has no start time or no address yet. */
  z.object({
    kind: z.literal("host-details"),
    ...NightRef,
    missing: z.array(z.enum(["time", "address"])).min(1),
  }),
  /** They have never declared which games they own. */
  z.object({ kind: z.literal("collection") }),
]);
export type OutstandingItem = z.infer<typeof OutstandingItemSchema>;
export type OutstandingKind = OutstandingItem["kind"];

export const MemberOutstandingSchema = z.object({
  items: z.array(OutstandingItemSchema),
  /** Notes the admins wrote that aren't ticked off. */
  openNotes: z.number().int().nonnegative(),
});
export type MemberOutstanding = z.infer<typeof MemberOutstandingSchema>;

/** `GET /api/admin/outstanding` — every member, keyed by user id. */
export const AdminOutstandingResponseSchema = z.object({
  members: z.record(z.string(), MemberOutstandingSchema),
});
export type AdminOutstandingResponse = z.infer<typeof AdminOutstandingResponseSchema>;

// ── Admin notes ─────────────────────────────────────────────────────────

export const MEMBER_NOTE_MAX = 500;

export const AdminMemberNoteSchema = z.object({
  id: z.number().int(),
  text: z.string(),
  /** When it was ticked off; null while still outstanding. */
  doneAt: z.string().nullable(),
  createdAt: z.string(),
  /** The admin who wrote it (null once their account is gone). */
  createdByName: z.string().nullable(),
});
export type AdminMemberNote = z.infer<typeof AdminMemberNoteSchema>;

/** `GET /api/admin/users/:id/notes` — open notes first, newest first within each. */
export const AdminMemberNotesResponseSchema = z.object({
  notes: z.array(AdminMemberNoteSchema),
});

const NoteText = z.string().trim().min(1).max(MEMBER_NOTE_MAX);

/** `POST /api/admin/users/:id/notes`. */
export const CreateMemberNoteBodySchema = z.object({ text: NoteText });

/** `PATCH /api/admin/users/:id/notes/:noteId` — edit the text and/or tick it. */
export const UpdateMemberNoteBodySchema = z
  .object({ text: NoteText.optional(), done: z.boolean().optional() })
  .refine((b) => b.text !== undefined || b.done !== undefined, "nothing to update");

/** The note as it stands after a create or an update. */
export const AdminMemberNoteResponseSchema = z.object({ note: AdminMemberNoteSchema });
