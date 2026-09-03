import { z } from "zod";
import { PurchaseTallyEntrySchema, VOTES_PER_PLAYER } from "./purchase-vote.ts";
import { GreetingAckBodySchema, GreetingSchema, SkillPlayerRefSchema } from "./skills.ts";

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

// The reminder deliberately has NO ack arm: "Later" only hides it for the
// current visit (client state) and it returns next app open — that IS the
// reminder behavior. The announce ack is what flips a viewer from announce
// to reminder.
export const AppGreetingAckBodySchema = z.discriminatedUnion("kind", [
  ...GreetingAckBodySchema.options,
  z.object({ kind: z.literal("purchase-vote-announce"), pollId: z.number().int().positive() }),
  z.object({ kind: z.literal("purchase-vote-result"), pollId: z.number().int().positive() }),
]);
export type AppGreetingAckBody = z.infer<typeof AppGreetingAckBodySchema>;

export const AppGreetingAckResponseSchema = z.object({ ok: z.literal(true) });
