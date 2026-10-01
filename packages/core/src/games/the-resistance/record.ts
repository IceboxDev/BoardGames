/**
 * The Resistance game record — ONE shape for three readers:
 *
 *   - the engine's history (and so the replay log, with `roles` + `cards`),
 *   - a seat's player view (public: votes once revealed, fail COUNTS only),
 *   - the Solver's manual tabletop entry (whatever the table saw).
 *
 * The Solver reads nothing else, so a physical game, a finished online match
 * and a live seat are analysed by the same code.
 */

import { z } from "zod";

export const ROLES = ["resistance", "spy"] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

export const MissionCardSchema = z.enum(["success", "fail"]);
export type MissionCard = z.infer<typeof MissionCardSchema>;

export const VariantsSchema = z.object({
  /** The leader picks which mission to attempt; mission 5 opens after two successes. */
  targeting: z.boolean().default(false),
  /** No spy reveal: spies don't know each other. */
  blindSpies: z.boolean().default(false),
});
export type Variants = z.infer<typeof VariantsSchema>;

const Seat = z.number().int().min(0).max(9);
const MissionIndex = z.number().int().min(0).max(4);

export const ProposalRecordSchema = z.object({
  leader: Seat,
  /** Which mission the team is for (always the next one without Targeting). */
  mission: MissionIndex,
  /** Seat indices, ascending. */
  team: z.array(Seat).min(2).max(5),
  /** `votes[seat]` = approved; `null` while the vote is open or when nobody wrote it down. */
  votes: z.array(z.boolean()).nullable(),
});
export type ProposalRecord = z.infer<typeof ProposalRecordSchema>;

export const MissionResultSchema = z.object({
  mission: MissionIndex,
  team: z.array(Seat).min(2).max(5),
  fails: z.number().int().min(0).max(5),
  success: z.boolean(),
  /**
   * `cards[seat]` — who played what, where known (the replay log; a Sergeant-
   * style peek in a tabletop game). `null` for seats off the team or unknown.
   * Never present in a player view.
   */
  cards: z.array(MissionCardSchema.nullable()).optional(),
});
export type MissionResult = z.infer<typeof MissionResultSchema>;

export const RoundRecordSchema = z.object({
  /** Every proposal this round, in order; the approved one (if any) is last. */
  proposals: z.array(ProposalRecordSchema),
  /** The mission's result once it has been run. */
  result: MissionResultSchema.nullable(),
});
export type RoundRecord = z.infer<typeof RoundRecordSchema>;

export const WinReasonSchema = z.enum(["three-successes", "three-fails", "five-rejections"]);
export type WinReason = z.infer<typeof WinReasonSchema>;

export const ResistanceRecordSchema = z.object({
  playerCount: z.number().int().min(5).max(10),
  /** Display names by seat, when known. */
  names: z.array(z.string().max(40)).optional(),
  variants: VariantsSchema,
  firstLeader: Seat,
  rounds: z.array(RoundRecordSchema),
  /** Everyone's role — the replay log, or a tabletop game's end-of-game reveal. */
  roles: z.array(RoleSchema).nullable().optional(),
  winner: RoleSchema.nullable().optional(),
  winReason: WinReasonSchema.nullable().optional(),
});
export type ResistanceRecord = z.infer<typeof ResistanceRecordSchema>;

/** The replay log: the full record plus its format tag and the deal's seed. */
export const ResistanceReplayLogSchema = ResistanceRecordSchema.extend({
  formatVersion: z.literal(1),
  seed: z.number().int(),
});
export type ResistanceReplayLog = z.infer<typeof ResistanceReplayLogSchema>;
