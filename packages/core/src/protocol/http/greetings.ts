import { z } from "zod";
import { PurchaseTallyEntrySchema, VOTES_PER_PLAYER } from "./purchase-vote.ts";
import { GreetingSchema, SkillPlayerRefSchema } from "./skills.ts";

// ── App-wide greeting queue: GET /api/greetings + POST /api/greetings/ack
//
// The generalization of the skill greeting queue (`skills.ts`): one
// server-arbitrated popup for the whole app, so exactly one can be pending
// and the client never has to arbitrate. The purchase-vote ladder outranks
// everything: a one-time ANNOUNCE card ("game purchase voting is live" — the
// same treatment the skill-intro launch got), then a REMINDER card on every
// later visit while the viewer still has votes to spend, then the one-time
// winner reveal once the poll closes. The greetings are cards ABOUT the vote;
// the voting screen itself is a separate modal they open — so casting a vote
// can never unmount the surface the player is standing on.

export const PurchaseVoteAnnounceGreetingSchema = z.object({
  kind: z.literal("purchase-vote-announce"),
  pollId: z.number().int().positive(),
  /** Candidate slugs — the announce card shows a strip of contenders. */
  candidates: z.array(z.string().min(1)).min(1),
  voterCount: z.number().int().min(0),
  requiredVoters: z.number().int().min(1),
});
export type PurchaseVoteAnnounceGreeting = z.infer<typeof PurchaseVoteAnnounceGreetingSchema>;

export const PurchaseVoteReminderGreetingSchema = z.object({
  kind: z.literal("purchase-vote-reminder"),
  pollId: z.number().int().positive(),
  votesLeft: z.number().int().min(1).max(VOTES_PER_PLAYER),
  voterCount: z.number().int().min(0),
  requiredVoters: z.number().int().min(1),
});
export type PurchaseVoteReminderGreeting = z.infer<typeof PurchaseVoteReminderGreetingSchema>;

export const PurchaseVoteResultGreetingSchema = z.object({
  kind: z.literal("purchase-vote-result"),
  pollId: z.number().int().positive(),
  winnerSlug: z.string().min(1),
  tally: z.array(PurchaseTallyEntrySchema),
});
export type PurchaseVoteResultGreeting = z.infer<typeof PurchaseVoteResultGreetingSchema>;

export const AppGreetingSchema = z.discriminatedUnion("kind", [
  ...GreetingSchema.options,
  PurchaseVoteAnnounceGreetingSchema,
  PurchaseVoteReminderGreetingSchema,
  PurchaseVoteResultGreetingSchema,
]);
export type AppGreeting = z.infer<typeof AppGreetingSchema>;

export const AppGreetingResponseSchema = z.object({
  /** Null when the viewer has nothing pending. */
  greeting: AppGreetingSchema.nullable(),
  /** Side-car name/image map for every userId the greeting references.
   * Empty for the vote kinds. */
  players: z.record(z.string(), SkillPlayerRefSchema),
});
export type AppGreetingResponse = z.infer<typeof AppGreetingResponseSchema>;

// Every ack carries HOW the card was answered — "later" (clicked away) or
// "cta" (followed the button) — so the admin activity trail can show
// responses, not just displays. The reminder's ack is LOG-ONLY server-side:
// no seen-state is written, so it still returns every app open until the
// votes are spent — that IS the reminder behavior. The announce ack is what
// flips a viewer from announce to reminder.
export const GreetingAckActionSchema = z.enum(["later", "cta"]);
export type GreetingAckAction = z.infer<typeof GreetingAckActionSchema>;

const pollId = z.number().int().positive();
export const AppGreetingAckBodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("skill-intro"), action: GreetingAckActionSchema }),
  z.object({
    kind: z.literal("spotlight"),
    id: z.number().int().positive(),
    action: GreetingAckActionSchema,
  }),
  z.object({ kind: z.literal("purchase-vote-announce"), pollId, action: GreetingAckActionSchema }),
  z.object({ kind: z.literal("purchase-vote-reminder"), pollId, action: GreetingAckActionSchema }),
  z.object({ kind: z.literal("purchase-vote-result"), pollId, action: GreetingAckActionSchema }),
]);
export type AppGreetingAckBody = z.infer<typeof AppGreetingAckBodySchema>;

export const AppGreetingAckResponseSchema = z.object({ ok: z.literal(true) });
