// Persisted-state schemas for the Storyteller companion.
//
// The companion's whole game lives in the Storyteller's phone (localStorage)
// and survives app updates, so its shape is a compatibility boundary exactly
// like the wire protocol: one Zod schema per persisted document, types derived
// with `z.infer`, and a `version` literal that `persistence.ts` migrates
// forward. Never add a required field here without bumping the version and
// writing the migration — `persistence.test.ts` pins every historical shape.

import { z } from "zod";
import { CHARACTER_SHEET_ORDER } from "./characters.ts";

export const EditionSchema = z.enum(["trouble-brewing", "bad-moon-rising"]);

/** Every known character id; the sheet order doubles as the enum's value list. */
export const CharacterIdSchema = z.enum(CHARACTER_SHEET_ORDER);

export const AlignmentSchema = z.enum(["good", "evil"]);
export type Alignment = z.infer<typeof AlignmentSchema>;

/** A chair index. Seats are dense (0..n-1) and equal the player's index in `players`. */
export const SeatSchema = z.number().int().nonnegative();

export const DeathCauseSchema = z.enum([
  "execution",
  "demon",
  "slayer",
  "virgin",
  "gunslinger",
  "exile",
  "storyteller",
  // Bad Moon Rising causes
  "assassin",
  "godfather",
  "gambler",
  "moonchild",
  "gossip",
  "tinker",
  "grandmother",
]);
export type DeathCause = z.infer<typeof DeathCauseSchema>;

export const CompanionPlayerSchema = z.object({
  seat: SeatSchema,
  name: z.string(),
  character: CharacterIdSchema,
  /** TB Drunk: the Townsfolk they believe they are. BMR Lunatic: the Demon they believe they are. */
  believedCharacter: CharacterIdSchema.optional(),
  alive: z.boolean(),
  /** Dead players keep one ghost vote for the rest of the game. */
  ghostVote: z.boolean(),
  /** TB: Poisoner target (cleared at next dusk). BMR: Pukka venom (until death/cure). */
  poisoned: z.boolean(),
  /** Monk target — safe from the Demon tonight (cleared at dawn). */
  protectedTonight: z.boolean(),
  /** Registers as a Demon to the Fortune Teller. */
  redHerring: z.boolean(),
  /** Butler only: the master they may only vote alongside. */
  butlerMaster: SeatSchema.optional(),
  /** Once-per-game ability spent (Slayer, Virgin, Courtier, Assassin, Professor, Fool, Judge…). */
  usedAbility: z.boolean(),
  /** Died during the current night; announced and cleared at dawn. */
  diedTonight: z.boolean(),
  /** Travellers (and the BMR Goon): their current assigned alignment. */
  alignment: AlignmentSchema.optional(),
  /** Bureaucrat's mark — this player's vote counts as 3 today. */
  tripleVote: z.boolean().optional(),
  /** Thief's mark — this player's vote counts as −1 today. */
  negativeVote: z.boolean().optional(),
  /** Beggar only: donated vote tokens currently held. */
  beggarTokens: z.number().int().nonnegative().optional(),
  /** Traveller left town entirely (not dead — gone; no ghost vote). */
  left: z.boolean().optional(),
  // ── Bad Moon Rising statuses ────────────────────────────────────────
  /** Drunk for this many more dusks (1 = until the next dusk; Courtier sets 3). */
  drunkNights: z.number().int().optional(),
  /** Which character's ability caused the drunkenness (ends if that character dies). */
  drunkSource: CharacterIdSchema.optional(),
  /** Grandmother only: their grandchild's seat. */
  grandchild: SeatSchema.optional(),
  /** Exorcist / Devil's Advocate: last night's pick (may not repeat it). */
  lastChoice: SeatSchema.optional(),
  /** Innkeeper mark — cannot die tonight (cleared at dawn). */
  safeTonight: z.boolean().optional(),
  /** Devil's Advocate mark — survives execution today (cleared at dusk). */
  survivesExecution: z.boolean().optional(),
  /** Zombuul after their first death: shown as dead, secretly alive. */
  registersDead: z.boolean().optional(),
  /** Killed by the Demon tonight (Grandmother's grandchild check; cleared at dawn). */
  diedByDemonTonight: z.boolean().optional(),
  /** Apprentice only: the Townsfolk/Minion ability they gained. */
  apprenticeAbility: CharacterIdSchema.optional(),
  /**
   * What the Storyteller actually told this player at their night step —
   * one entry per night — next to the true answer, so a poisoned Empath's
   * "2" or a shuffled Washerwoman pair can be read back later.
   */
  infoGiven: z
    .array(
      z.object({
        night: z.number().int().positive(),
        told: z.string(),
        truth: z.string().optional(),
      }),
    )
    .optional(),
  note: z.string().optional(),
});
export type CompanionPlayer = z.infer<typeof CompanionPlayerSchema>;

export const PhaseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("reveal") }),
  z.object({ kind: z.literal("night"), night: z.number().int().positive() }),
  z.object({ kind: z.literal("day"), day: z.number().int().positive() }),
  z.object({ kind: z.literal("ended"), winner: AlignmentSchema, reason: z.string() }),
]);
export type Phase = z.infer<typeof PhaseSchema>;

export const VoteResultSchema = z.enum(["about-to-die", "failed", "tied"]);
export type VoteResult = z.infer<typeof VoteResultSchema>;

export const NominationSchema = z.object({
  nominator: SeatSchema,
  nominee: SeatSchema,
  votes: z.number().int(),
  required: z.number().int().nonnegative(),
  result: VoteResultSchema,
  /** Who raised a hand, clockwise from the nominee (when tallied with the assistant). */
  voters: z.array(SeatSchema).optional(),
});
export type Nomination = z.infer<typeof NominationSchema>;

export const DayStateSchema = z.object({
  nominatorsUsed: z.array(SeatSchema),
  nomineesUsed: z.array(SeatSchema),
  nominations: z.array(NominationSchema),
  aboutToDie: z.object({ seat: SeatSchema, votes: z.number().int() }).optional(),
  /**
   * Highest successful tally today. Survives a tie (which clears
   * `aboutToDie`): a later nominee still has to EXCEED the tied number.
   */
  highestVotes: z.number().int().nonnegative(),
  executed: SeatSchema.optional(),
  /** The Gunslinger may kill only once per day. */
  gunslingerUsed: z.boolean().optional(),
  /** Deaths that happened during THIS day (any cause) — the Zombuul only wakes after a deathless day. */
  deaths: z.number().int().nonnegative(),
});
export type DayState = z.infer<typeof DayStateSchema>;

export const LogEntrySchema = z.object({
  id: z.number().int(),
  when: z.string(),
  text: z.string(),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

/**
 * A night step's stable identity: `<kind>` for the seatless info/dawn steps,
 * `<kind>:<seat>` otherwise. Deterministic from the step's content, so the
 * queue can be rebuilt after every action and still know which entry the
 * Storyteller is on and which entries already ran — see `nightStepId` in
 * companion.ts.
 */
export const NightStepIdSchema = z.string().regex(/^[a-z-]+(?::\d+)?$/, "Expected <kind>[:<seat>]");
export type NightStepId = z.infer<typeof NightStepIdSchema>;

/**
 * Where the current night stands. Everything the wizard needs to resume
 * after a phone lock, a tab switch or a refresh lives here, not in React
 * state — so the same kill can never be offered twice. Reset at dusk.
 */
export const NightProgressSchema = z.object({
  /** The step the Storyteller is on. Absent = the first step of the night. */
  cursor: NightStepIdSchema.optional(),
  /**
   * Steps that have booked their effect tonight. A resolved step stays in
   * the queue (marked done) even when the state change it caused would drop
   * it — a Gambler who died on their guess, an Assassin who spent their
   * strike — so the wizard never jumps.
   */
  resolved: z.array(NightStepIdSchema),
  /** Seats the Demon pointed at tonight, in order, whatever the outcome. */
  demonChoices: z.array(SeatSchema),
});
export type NightProgress = z.infer<typeof NightProgressSchema>;

export const COMPANION_STATE_VERSION = 2;

export const CompanionStateSchema = z.object({
  version: z.literal(COMPANION_STATE_VERSION),
  script: EditionSchema,
  players: z.array(CompanionPlayerSchema),
  demonBluffs: z.array(CharacterIdSchema),
  phase: PhaseSchema,
  nightProgress: NightProgressSchema,
  day: DayStateSchema,
  /** Most recent execution — feeds the Undertaker the following night. */
  lastExecution: z
    .object({ day: z.number().int(), seat: SeatSchema, character: CharacterIdSchema })
    .optional(),
  /** The previous night's toll, for the day's dawn recap. */
  lastNight: z.object({ night: z.number().int(), died: z.array(SeatSchema) }).optional(),
  /** Seat that became the Imp today (Scarlet Woman / star pass) — gets a "you are" step tonight. */
  pendingImpInfo: SeatSchema.optional(),
  /** The non-playing Storyteller running the game (match-history moderator). */
  storyteller: z.string().optional(),
  /** Set once the finished game is ported to match history (blocks double-posts). */
  historyMatchId: z.number().int().optional(),
  // ── Bad Moon Rising game-level state ────────────────────────────────
  /** The Exorcist chose the Demon tonight — the Demon doesn't wake (cleared at dawn). */
  exorcisedDemon: z.boolean().optional(),
  /** Seat currently carrying the Pukka's venom — they die after the Pukka's next pick. */
  pukkaVictim: SeatSchema.optional(),
  /**
   * The night on which the Po chose no-one. From the following night on the
   * Po points at three players; consumed at the dawn after it attacks.
   */
  poChargedNight: z.number().int().optional(),
  /** The Shabaloth's picks last night — one may be regurgitated tonight. */
  shabalothVictims: z.array(SeatSchema).optional(),
  /** The Gossip made a TRUE public statement today — a player dies tonight (cleared at dawn). */
  gossipTrue: z.boolean().optional(),
  /** A dead Moonchild who must still publicly choose a player. */
  moonchildPending: SeatSchema.optional(),
  /** The Moonchild's chosen player — dies tonight if good (cleared at dawn). */
  moonchildTarget: SeatSchema.optional(),
  /** The Moonchild was drunk or poisoned when they chose — the curse does nothing. */
  moonchildCurseVoid: z.boolean().optional(),
  /** An Outsider died during the day — the Godfather kills tonight (cleared at dawn). */
  outsiderDiedToday: z.boolean().optional(),
  /** Snapshot at dusk: nobody died during the preceding day, so the Zombuul acts. */
  nightZombuulActs: z.boolean().optional(),
  /** Day a Minion was executed with a sober Minstrel — everyone drunk until dusk tomorrow. */
  minstrelDrunkDay: z.number().int().optional(),
  /** Mastermind: the Demon is secretly dead; one final day decides the game. */
  mastermindExtraDay: z.boolean().optional(),
  /** Who the Lunatic "attacked" tonight — shown to the real Demon (cleared at dawn). */
  lunaticChoices: z.array(SeatSchema).optional(),
  log: z.array(LogEntrySchema),
  nextLogId: z.number().int(),
});
export type CompanionState = z.infer<typeof CompanionStateSchema>;

// ── Bag stage ─────────────────────────────────────────────────────────

export const DistributionSchema = z.object({
  townsfolk: z.number().int().nonnegative(),
  outsiders: z.number().int().nonnegative(),
  minions: z.number().int().nonnegative(),
  demons: z.number().int().nonnegative(),
});
export type Distribution = z.infer<typeof DistributionSchema>;

export const DemonSkillSchema = z.enum(["new", "experienced"]);
/** How practised the demon player is at sustaining a bluff. */
export type DemonSkill = z.infer<typeof DemonSkillSchema>;

export const BagSetupSchema = z.object({
  edition: EditionSchema,
  /** The actual characters in play — includes "drunk"/"lunatic" when dealt. */
  charactersInPlay: z.array(CharacterIdSchema),
  /**
   * The physical tokens for the bag: identical to `charactersInPlay` except
   * the TB Drunk is replaced by their believed Townsfolk token. Whoever draws
   * that token IS the Drunk — they never learn it. In BMR the Lunatic and the
   * Demon token both go in as-is, and the DRAWS are swapped: whoever draws
   * the Demon token is secretly the Lunatic, and whoever draws the Lunatic
   * token is the real Demon (they learn so on the first night).
   */
  bagTokens: z.array(CharacterIdSchema),
  /** TB: set when the Drunk is in play — the not-in-play Townsfolk token they drew. */
  believedCharacter: CharacterIdSchema.optional(),
  /** BMR: set when the Lunatic is in play — the Demon they believe they are. */
  lunaticDemon: CharacterIdSchema.optional(),
  /** BMR: the Godfather's setup swap that was applied. */
  godfatherAdjustment: z.union([z.literal(1), z.literal(-1)]).optional(),
  distribution: DistributionSchema,
  /** Three not-in-play good characters to show the Demon as safe bluffs. */
  demonBluffs: z.array(CharacterIdSchema),
});
export type BagSetup = z.infer<typeof BagSetupSchema>;

/** One chair in circle order. Traveller seats never draw from the bag. */
export const BagDraftSeatSchema = z.object({
  name: z.string(),
  /** Set when this seat was marked a traveller at setup; the character is
   * picked (or rolled) on the Bag screen, alignment is the ST's call. */
  traveller: z
    .object({ character: CharacterIdSchema.nullable(), alignment: AlignmentSchema })
    .optional(),
});
export type BagDraftSeat = z.infer<typeof BagDraftSeatSchema>;

export const BAG_DRAFT_VERSION = 1;

/**
 * The in-between stage: the bag has been rolled and players are drawing
 * physical tokens; `draws[i]` is what seat `i` pulled (null until recorded;
 * traveller seats stay null). Persisted so a locked phone mid-draw loses
 * nothing.
 */
export const BagDraftSchema = z.object({
  version: z.literal(BAG_DRAFT_VERSION),
  edition: EditionSchema,
  seats: z.array(BagDraftSeatSchema),
  storyteller: z.string().optional(),
  bag: BagSetupSchema,
  draws: z.array(CharacterIdSchema.nullable()),
  /** Bluff weighting for the eventual demon; toggled on the Bag screen. */
  demonSkill: DemonSkillSchema.optional(),
  /**
   * One-level undo for the Bag screen's structural edits (reroll, token
   * swap, late-player add): the full pre-edit snapshot plus a short label
   * for the button ("Undo bag reroll"). Cleared once used or superseded.
   */
  undo: z
    .object({
      label: z.string(),
      seats: z.array(BagDraftSeatSchema),
      bag: BagSetupSchema,
      draws: z.array(CharacterIdSchema.nullable()),
    })
    .optional(),
});
export type BagDraft = z.infer<typeof BagDraftSchema>;

/** Last-used player roster, so the next game night starts pre-filled. */
export const RosterSchema = z.array(z.string());
