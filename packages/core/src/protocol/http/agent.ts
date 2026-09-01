import { z } from "zod";

// ── Agent surface (/api/agent) ────────────────────────────────────────
//
// Read-only endpoints authenticated by a vestauth (web-bot-auth / RFC 9421)
// request signature instead of a browser session — see the server's
// auth/agent-auth.ts. The whole surface is DARK unless the server operator
// allowlists specific agent UIDs via VESTAUTH_ALLOWED_AGENT_UIDS; it exists
// so a Claude Code session's signed request can verify what an auth-gated
// admin view would show in prod, without holding an admin login. No emails,
// no writes.

const DateKeyStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const AgentWhoamiResponseSchema = z.object({
  /** The verified vestauth agent UID (e.g. "agent-694f…"). */
  uid: z.string().min(1),
});
export type AgentWhoamiResponse = z.infer<typeof AgentWhoamiResponseSchema>;

// One member's inactivity math — mirrors what the admin page computes
// client-side (core/availability/inactivity is the shared rule). `name`
// deliberately without email.
export const AgentInactivityMemberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  role: z.string().nullable(),
  coverage: z.object({
    can: z.number().int().min(0),
    maybe: z.number().int().min(0),
    total: z.number().int().min(0),
  }),
  latestMarkedDay: DateKeyStringSchema.nullable(),
  lastPlayedDay: DateKeyStringSchema.nullable(),
  zeroDays: z.number().int().min(0),
  inactive: z.boolean(),
});

export const AgentInactivityResponseSchema = z.object({
  generatedAt: z.string(),
  // The server computes the editable window in UTC; the admin page uses the
  // viewer's local timezone, so near-midnight snapshots can differ by a day.
  todayKey: DateKeyStringSchema,
  windowEndKey: DateKeyStringSchema,
  inactiveAfterDays: z.number().int().positive(),
  members: z.array(AgentInactivityMemberSchema),
});
export type AgentInactivityResponse = z.infer<typeof AgentInactivityResponseSchema>;
