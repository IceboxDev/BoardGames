// The Storyteller's grimoire edits as data.
//
// Every state-changing reducer in `companion.ts` / `voting.ts` has one action
// here, named after the reducer, so a grimoire change can cross a wire (the
// online Storyteller's browser → the server) and be replayed from a log. The
// online game applies these to its `CompanionState`; the phone companion still
// calls the reducers directly. `actions.test.ts` fails when a new reducer has
// no action, so the two can't drift apart.
//
// The schemas check shape and ranges only. Seat indices are checked against
// the live table in `applyCompanionAction` (the reducers throw on an unknown
// seat via `playerAt`), and the reducers themselves stay the judges of what a
// move means — the Storyteller is the boss.

import { z } from "zod";
import {
  addTraveller,
  beginMastermindDay,
  beginNight,
  changeCharacter,
  clearDrunk,
  dawn,
  endDay,
  endGame,
  executeAboutToDie,
  executeScapegoatInstead,
  exileTraveller,
  giveBeggarToken,
  kill,
  markAbilityUsed,
  moveNightCursor,
  moveSeat,
  recordAdvocateChoice,
  recordAssassinKill,
  recordCourtierChoice,
  recordDemonKill,
  recordExorcistChoice,
  recordGamblerGuess,
  recordGodfatherKill,
  recordGoonTrigger,
  recordGossipKill,
  recordGossipStatement,
  recordGrandmotherDeath,
  recordGunslingerShot,
  recordInfoGiven,
  recordInnkeeperChoice,
  recordJudgeRuling,
  recordMoonchildChoice,
  recordNomination,
  recordPoCharge,
  recordProfessorChoice,
  recordPukkaPoison,
  recordSailorChoice,
  recordSlayerShot,
  recordTinkerDeath,
  recordVirginTrigger,
  regurgitate,
  removeTraveller,
  reorderSeats,
  resolveMoonchildCurse,
  resolvePukkaVictim,
  restoreGhostVote,
  revive,
  setApprenticeAbility,
  setButlerMaster,
  setDrunk,
  setGrandchild,
  setLunaticChoices,
  setMonkProtection,
  setNegativeVote,
  setNote,
  setPoison,
  setTravellerAlignment,
  setTripleVote,
  spareByPacifist,
  spendGhostVote,
  spendVoteTokens,
  survivedExecution,
  swapSeats,
} from "./companion.ts";
import {
  AlignmentSchema,
  CharacterIdSchema,
  type CompanionState,
  DeathCauseSchema,
  SeatSchema,
} from "./schema.ts";
import { recordVote } from "./voting.ts";

const Seat = SeatSchema.max(31);
const OptionalSeat = Seat.optional();
const Seats = z.array(Seat).max(32);
const ShortText = z.string().max(200);
const LongText = z.string().max(1000);

const variant = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.object({ type: z.literal(type), ...shape }).strict();

/** One grimoire edit — no `batch`, which wraps these (see `CompanionActionSchema`). */
export const SingleCompanionActionSchema = z.discriminatedUnion("type", [
  // ── Phase flow ────────────────────────────────────────────────────────
  variant("moveNightCursor", { delta: z.number().int().min(-64).max(64) }),
  variant("beginNight", {}),
  variant("dawn", {}),
  variant("endDay", {}),
  variant("beginMastermindDay", {}),
  variant("endGame", { winner: AlignmentSchema, reason: ShortText }),
  // ── Life and status ───────────────────────────────────────────────────
  variant("kill", { seat: Seat, cause: DeathCauseSchema }),
  variant("survivedExecution", { seat: Seat, reason: ShortText }),
  variant("revive", { seat: Seat }),
  variant("setPoison", { seat: OptionalSeat }),
  variant("setMonkProtection", { seat: OptionalSeat }),
  variant("setButlerMaster", { butlerSeat: Seat, masterSeat: Seat }),
  variant("setTripleVote", { seat: OptionalSeat }),
  variant("setNegativeVote", { seat: OptionalSeat }),
  variant("setDrunk", {
    seat: Seat,
    nights: z.number().int().min(1).max(9),
    source: CharacterIdSchema,
  }),
  variant("clearDrunk", { seat: Seat }),
  variant("markAbilityUsed", { seat: Seat }),
  variant("setNote", { seat: Seat, note: LongText }),
  variant("recordInfoGiven", { seat: Seat, told: ShortText, truth: ShortText.optional() }),
  variant("changeCharacter", { seat: Seat, character: CharacterIdSchema }),
  // ── Travellers ────────────────────────────────────────────────────────
  variant("addTraveller", {
    name: z.string().min(1).max(60),
    character: CharacterIdSchema,
    alignment: AlignmentSchema,
    afterSeat: Seat.nullable().optional(),
  }),
  variant("setTravellerAlignment", { seat: Seat, alignment: AlignmentSchema }),
  variant("exileTraveller", { seat: Seat }),
  variant("removeTraveller", { seat: Seat }),
  variant("giveBeggarToken", { donorSeat: Seat }),
  variant("recordGunslingerShot", { target: Seat }),
  variant("executeScapegoatInstead", { savedSeat: Seat }),
  // ── Votes ─────────────────────────────────────────────────────────────
  variant("spendGhostVote", { seat: Seat }),
  variant("restoreGhostVote", { seat: Seat }),
  variant("spendVoteTokens", { voters: Seats }),
  variant("recordNomination", {
    nominator: Seat,
    nominee: Seat,
    votes: z.number().int().min(-32).max(96),
  }),
  variant("recordVote", { nominator: Seat, nominee: Seat, voters: Seats }),
  // ── Night actions ─────────────────────────────────────────────────────
  variant("recordDemonKill", {
    target: Seat,
    outcome: z.enum(["dies", "safe"]),
    note: ShortText.optional(),
  }),
  variant("recordSailorChoice", {
    sailorSeat: Seat,
    targetSeat: Seat,
    whoIsDrunk: z.enum(["sailor", "target"]),
  }),
  variant("recordInnkeeperChoice", {
    innkeeperSeat: Seat,
    guests: z.tuple([Seat, Seat]),
    drunkSeat: Seat,
  }),
  variant("recordCourtierChoice", { courtierSeat: Seat, character: CharacterIdSchema }),
  variant("recordGamblerGuess", { gamblerSeat: Seat, targetSeat: Seat, guess: CharacterIdSchema }),
  variant("recordExorcistChoice", { exorcistSeat: Seat, targetSeat: Seat }),
  variant("recordAdvocateChoice", { advocateSeat: Seat, targetSeat: Seat }),
  variant("recordAssassinKill", { assassinSeat: Seat, targetSeat: Seat }),
  variant("recordGodfatherKill", { godfatherSeat: Seat, targetSeat: Seat }),
  variant("recordProfessorChoice", { professorSeat: Seat, targetSeat: Seat }),
  variant("setGrandchild", { grandmotherSeat: Seat, childSeat: Seat }),
  variant("recordPukkaPoison", { targetSeat: Seat }),
  variant("resolvePukkaVictim", { victimSeat: Seat, dies: z.boolean() }),
  variant("regurgitate", { seat: Seat }),
  variant("recordPoCharge", {}),
  variant("recordGoonTrigger", { chooserSeat: Seat }),
  variant("setApprenticeAbility", { seat: Seat, character: CharacterIdSchema }),
  variant("setLunaticChoices", { seats: Seats }),
  variant("recordGossipKill", { targetSeat: Seat }),
  variant("recordTinkerDeath", { tinkerSeat: Seat }),
  variant("resolveMoonchildCurse", { dies: z.boolean() }),
  variant("recordGrandmotherDeath", { grandmotherSeat: Seat }),
  // ── Day actions ───────────────────────────────────────────────────────
  variant("recordGossipStatement", { wasTrue: z.boolean() }),
  variant("recordMoonchildChoice", { targetSeat: Seat }),
  variant("recordJudgeRuling", { judgeSeat: Seat, nomineeSeat: Seat, passes: z.boolean() }),
  variant("recordVirginTrigger", { nominator: Seat, virginSeat: Seat, triggers: z.boolean() }),
  variant("recordSlayerShot", { shooter: Seat, target: Seat, dies: z.boolean() }),
  variant("executeAboutToDie", {}),
  variant("spareByPacifist", { seat: Seat }),
  // ── Seating ───────────────────────────────────────────────────────────
  variant("reorderSeats", { order: Seats }),
  variant("swapSeats", { a: Seat, b: Seat }),
  variant("moveSeat", { seat: Seat, afterSeat: Seat.nullable() }),
]);
export type SingleCompanionAction = z.infer<typeof SingleCompanionActionSchema>;

/** At most this many edits travel together (the Imp's star-pass is two). */
export const MAX_BATCH = 10;

/**
 * A grimoire edit, or several applied in order as one step (one undo entry,
 * one log of what happened) — e.g. the Imp's star-pass is a demon kill on
 * themselves plus the new Imp's character change.
 */
export const CompanionActionSchema = z.union([
  SingleCompanionActionSchema,
  z
    .object({
      type: z.literal("batch"),
      actions: z.array(SingleCompanionActionSchema).min(1).max(MAX_BATCH),
    })
    .strict(),
]);
export type CompanionAction = z.infer<typeof CompanionActionSchema>;

/** Every seat an action names, so they can be checked against the table first. */
function seatsNamed(action: SingleCompanionAction): number[] {
  const seats: number[] = [];
  for (const [key, value] of Object.entries(action)) {
    if (key === "type" || key === "delta" || key === "nights" || key === "votes") continue;
    if (typeof value === "number") seats.push(value);
    else if (Array.isArray(value)) {
      for (const v of value) if (typeof v === "number") seats.push(v);
    }
  }
  return seats;
}

/** Thrown for an action that names a chair the table doesn't have. */
export class UnknownSeatError extends Error {}

function applySingle(state: CompanionState, a: SingleCompanionAction): CompanionState {
  for (const seat of seatsNamed(a)) {
    if (seat >= state.players.length) throw new UnknownSeatError(`no seat ${seat} at this table`);
  }
  switch (a.type) {
    case "moveNightCursor":
      return moveNightCursor(state, a.delta);
    case "beginNight":
      return beginNight(state);
    case "dawn":
      return dawn(state);
    case "endDay":
      return endDay(state);
    case "beginMastermindDay":
      return beginMastermindDay(state);
    case "endGame":
      return endGame(state, a.winner, a.reason);
    case "kill":
      return kill(state, a.seat, a.cause);
    case "survivedExecution":
      return survivedExecution(state, a.seat, a.reason);
    case "revive":
      return revive(state, a.seat);
    case "setPoison":
      return setPoison(state, a.seat);
    case "setMonkProtection":
      return setMonkProtection(state, a.seat);
    case "setButlerMaster":
      return setButlerMaster(state, a.butlerSeat, a.masterSeat);
    case "setTripleVote":
      return setTripleVote(state, a.seat);
    case "setNegativeVote":
      return setNegativeVote(state, a.seat);
    case "setDrunk":
      return setDrunk(state, a.seat, a.nights, a.source);
    case "clearDrunk":
      return clearDrunk(state, a.seat);
    case "markAbilityUsed":
      return markAbilityUsed(state, a.seat);
    case "setNote":
      return setNote(state, a.seat, a.note);
    case "recordInfoGiven":
      return recordInfoGiven(state, a.seat, a.told, a.truth);
    case "changeCharacter":
      return changeCharacter(state, a.seat, a.character);
    case "addTraveller":
      return addTraveller(
        state,
        a.name,
        a.character,
        a.alignment,
        a.afterSeat === undefined ? {} : { afterSeat: a.afterSeat },
      );
    case "setTravellerAlignment":
      return setTravellerAlignment(state, a.seat, a.alignment);
    case "exileTraveller":
      return exileTraveller(state, a.seat);
    case "removeTraveller":
      return removeTraveller(state, a.seat);
    case "giveBeggarToken":
      return giveBeggarToken(state, a.donorSeat);
    case "recordGunslingerShot":
      return recordGunslingerShot(state, a.target);
    case "executeScapegoatInstead":
      return executeScapegoatInstead(state, a.savedSeat);
    case "spendGhostVote":
      return spendGhostVote(state, a.seat);
    case "restoreGhostVote":
      return restoreGhostVote(state, a.seat);
    case "spendVoteTokens":
      return spendVoteTokens(state, a.voters);
    case "recordNomination":
      return recordNomination(state, a.nominator, a.nominee, a.votes);
    case "recordVote":
      return recordVote(state, a.nominator, a.nominee, a.voters);
    case "recordDemonKill":
      return recordDemonKill(state, a.target, a.outcome, a.note);
    case "recordSailorChoice":
      return recordSailorChoice(state, a.sailorSeat, a.targetSeat, a.whoIsDrunk);
    case "recordInnkeeperChoice":
      return recordInnkeeperChoice(state, a.innkeeperSeat, a.guests, a.drunkSeat);
    case "recordCourtierChoice":
      return recordCourtierChoice(state, a.courtierSeat, a.character);
    case "recordGamblerGuess":
      return recordGamblerGuess(state, a.gamblerSeat, a.targetSeat, a.guess);
    case "recordExorcistChoice":
      return recordExorcistChoice(state, a.exorcistSeat, a.targetSeat);
    case "recordAdvocateChoice":
      return recordAdvocateChoice(state, a.advocateSeat, a.targetSeat);
    case "recordAssassinKill":
      return recordAssassinKill(state, a.assassinSeat, a.targetSeat);
    case "recordGodfatherKill":
      return recordGodfatherKill(state, a.godfatherSeat, a.targetSeat);
    case "recordProfessorChoice":
      return recordProfessorChoice(state, a.professorSeat, a.targetSeat);
    case "setGrandchild":
      return setGrandchild(state, a.grandmotherSeat, a.childSeat);
    case "recordPukkaPoison":
      return recordPukkaPoison(state, a.targetSeat);
    case "resolvePukkaVictim":
      return resolvePukkaVictim(state, a.victimSeat, a.dies);
    case "regurgitate":
      return regurgitate(state, a.seat);
    case "recordPoCharge":
      return recordPoCharge(state);
    case "recordGoonTrigger":
      return recordGoonTrigger(state, a.chooserSeat);
    case "setApprenticeAbility":
      return setApprenticeAbility(state, a.seat, a.character);
    case "setLunaticChoices":
      return setLunaticChoices(state, a.seats);
    case "recordGossipKill":
      return recordGossipKill(state, a.targetSeat);
    case "recordTinkerDeath":
      return recordTinkerDeath(state, a.tinkerSeat);
    case "resolveMoonchildCurse":
      return resolveMoonchildCurse(state, a.dies);
    case "recordGrandmotherDeath":
      return recordGrandmotherDeath(state, a.grandmotherSeat);
    case "recordGossipStatement":
      return recordGossipStatement(state, a.wasTrue);
    case "recordMoonchildChoice":
      return recordMoonchildChoice(state, a.targetSeat);
    case "recordJudgeRuling":
      return recordJudgeRuling(state, a.judgeSeat, a.nomineeSeat, a.passes);
    case "recordVirginTrigger":
      return recordVirginTrigger(state, a.nominator, a.virginSeat, a.triggers);
    case "recordSlayerShot":
      return recordSlayerShot(state, a.shooter, a.target, a.dies);
    case "executeAboutToDie":
      return executeAboutToDie(state);
    case "spareByPacifist":
      return spareByPacifist(state, a.seat);
    case "reorderSeats":
      return reorderSeats(state, a.order);
    case "swapSeats":
      return swapSeats(state, a.a, a.b);
    case "moveSeat":
      return moveSeat(state, a.seat, a.afterSeat);
  }
}

/**
 * Apply one grimoire edit (or a batch, in order). Throws on a seat the table
 * doesn't have or whatever the reducer itself refuses — callers on a wire
 * wrap this in `safeApply`.
 */
export function applyCompanionAction(
  state: CompanionState,
  action: CompanionAction,
): CompanionState {
  if (action.type === "batch") return action.actions.reduce(applySingle, state);
  return applySingle(state, action);
}

/** Every action type — the coverage test checks it against the reducers. */
export const COMPANION_ACTION_TYPES: readonly string[] = SingleCompanionActionSchema.options.map(
  (o) => o.shape.type.value,
);
