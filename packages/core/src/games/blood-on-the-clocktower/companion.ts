// Storyteller companion state for Trouble Brewing and Bad Moon Rising.
//
// This is the app-side Grimoire: it tracks each seat's character and states
// (alive/dead, poisoned, drunk, protected, ghost vote…), generates the
// night-sheet queue with the boxed sheet's skip rules, computes the true
// information each info character should be given, and referees day-phase
// vote math.
//
// Design rule: THE STORYTELLER IS THE BOSS (rulebook, page 5). The reducer
// never hard-blocks or auto-ends the game — selectors surface prompts and the
// UI asks the Storyteller to confirm. The exceptions are protections whose
// outcome the rules fix exactly (sober Sailor, Fool's first death, Tea Lady,
// Innkeeper, Devil's Advocate, Zombuul's first death): `kill` resolves those
// itself so a hurried tap can't corrupt the Grimoire. Everything is pure and
// serializable so the web client can persist state to localStorage as-is.

import type { CharacterId } from "./characters.ts";
import {
  BMR_FIRST_NIGHT_ORDER,
  BMR_OTHER_NIGHTS_ORDER,
  CHARACTERS,
  FIRST_NIGHT_ORDER,
  isEvil,
  OTHER_NIGHTS_ORDER,
} from "./characters.ts";
// The persisted state is defined ONCE as a Zod schema (schema.ts) and the
// types below are inferred from it, so the reducer, the localStorage loader
// and the migration chain can never disagree about the shape. Re-exported so
// every consumer keeps importing from this module.
import type {
  Alignment,
  CompanionPlayer,
  CompanionState,
  DayState,
  DeathCause,
  NightProgress,
  NightStepId,
  Nomination,
  Phase,
  VoteResult,
} from "./schema.ts";
import { COMPANION_STATE_VERSION } from "./schema.ts";
import type { GameSetup } from "./setup.ts";

export type {
  Alignment,
  CompanionPlayer,
  CompanionState,
  DayState,
  DeathCause,
  LogEntry,
  NightProgress,
  NightStepId,
  Nomination,
  Phase,
  VoteResult,
} from "./schema.ts";

const EMPTY_DAY: DayState = {
  nominatorsUsed: [],
  nomineesUsed: [],
  nominations: [],
  highestVotes: 0,
  deaths: 0,
};

const EMPTY_NIGHT: NightProgress = { resolved: [], demonChoices: [] };

// ── Construction ──────────────────────────────────────────────────────

export function createGame(setup: GameSetup, opts?: { storyteller?: string }): CompanionState {
  const players: CompanionPlayer[] = setup.seats.map((s) => ({
    seat: s.seat,
    name: s.name,
    character: s.character,
    ...(s.believedCharacter ? { believedCharacter: s.believedCharacter } : {}),
    // Traveller seats carry their Storyteller-assigned alignment from setup.
    ...(s.alignment ? { alignment: s.alignment } : {}),
    alive: true,
    ghostVote: true,
    poisoned: false,
    protectedTonight: false,
    redHerring: s.seat === setup.redHerringSeat,
    usedAbility: false,
    diedTonight: false,
  }));
  const state: CompanionState = {
    version: COMPANION_STATE_VERSION,
    script: setup.edition ?? "trouble-brewing",
    players,
    demonBluffs: setup.demonBluffs,
    phase: { kind: "reveal" },
    nightProgress: EMPTY_NIGHT,
    day: EMPTY_DAY,
    ...(opts?.storyteller ? { storyteller: opts.storyteller } : {}),
    log: [],
    nextLogId: 1,
  };
  return log(
    state,
    "Setup",
    opts?.storyteller
      ? `Characters dealt. ${opts.storyteller} runs the game as the Storyteller.`
      : "Characters dealt.",
  );
}

// ── Small helpers ─────────────────────────────────────────────────────

export function apparentCharacter(p: CompanionPlayer): CharacterId {
  return p.believedCharacter ?? p.character;
}

export function isTraveller(p: CompanionPlayer): boolean {
  return CHARACTERS[p.character].type === "traveller";
}

/**
 * Travellers are whatever alignment the Storyteller assigned them, and the
 * BMR Goon's alignment flips mid-game — an explicit `alignment` always wins
 * over the character type.
 */
export function isEvilPlayer(p: CompanionPlayer): boolean {
  if (p.alignment) return p.alignment === "evil";
  if (isTraveller(p)) return false;
  return isEvil(CHARACTERS[p.character].type);
}

// ── Drunkenness (Bad Moon Rising) ─────────────────────────────────────

/** Is the Minstrel's everyone-is-drunk window currently open? */
export function minstrelActive(state: CompanionState): boolean {
  const d = state.minstrelDrunkDay;
  if (d === undefined) return false;
  // Triggered on day D: drunk for the rest of day D, night D+1 and day D+1.
  if (state.phase.kind === "day") return state.phase.day === d || state.phase.day === d + 1;
  if (state.phase.kind === "night") return state.phase.night === d + 1;
  return false;
}

/** Drunk from any BMR source (Sailor, Innkeeper, Courtier, Goon, Minstrel). */
export function isDrunkPlayer(state: CompanionState, p: CompanionPlayer): boolean {
  if ((p.drunkNights ?? 0) > 0) return true;
  return minstrelActive(state) && !isTraveller(p) && p.character !== "minstrel";
}

/** Drunk or poisoned — the ability is void. */
export function abilityVoid(state: CompanionState, p: CompanionPlayer): boolean {
  return p.poisoned || isDrunkPlayer(state, p);
}

/**
 * Tea Lady protection: seats that currently cannot die because they neighbour
 * an alive, sober Tea Lady whose BOTH alive neighbours are good.
 */
export function teaLadyProtectedSeats(state: CompanionState): number[] {
  const tea = state.players.find((p) => p.alive && p.character === "tea-lady");
  if (!tea || abilityVoid(state, tea)) return [];
  const neighbours = aliveNeighbours(state, tea.seat);
  if (neighbours.length < 2) return [];
  if (neighbours.some((s) => isEvilPlayer(playerAt(state, s)))) return [];
  return neighbours;
}

/** Every alive player, travellers included — the execution-vote threshold. */
export function aliveCount(state: CompanionState): number {
  return state.players.filter((p) => p.alive).length;
}

/**
 * Alive NON-traveller players. Travellers don't count for evil's
 * two-players-left win or the Scarlet Woman's 5+. (They DO count for the
 * Mayor's three-alive win — travellers must be exiled before day's end.)
 */
export function aliveResidents(state: CompanionState): number {
  return state.players.filter((p) => p.alive && !isTraveller(p)).length;
}

/** Everyone still at the table (alive or dead) — the exile-vote base. */
export function presentCount(state: CompanionState): number {
  return state.players.filter((p) => !p.left).length;
}

/** Exile needs at least half of ALL players (dead included, no ghost vote spent). */
export function exileVotesRequired(state: CompanionState): number {
  return Math.ceil(presentCount(state) / 2);
}

/** A functioning Demon: truly alive, or a Zombuul secretly living among the dead. */
export function demonAlive(state: CompanionState): boolean {
  return state.players.some(
    (p) => (p.alive || p.registersDead) && CHARACTERS[p.character].type === "demon",
  );
}

/** The in-play Demon (alive or secretly alive), if any. */
export function demonPlayer(state: CompanionState): CompanionPlayer | undefined {
  return state.players.find(
    (p) => (p.alive || p.registersDead) && CHARACTERS[p.character].type === "demon",
  );
}

function phaseLabel(phase: Phase): string {
  switch (phase.kind) {
    case "reveal":
      return "Setup";
    case "night":
      return `Night ${phase.night}`;
    case "day":
      return `Day ${phase.day}`;
    case "ended":
      return "End";
  }
}

function log(state: CompanionState, when: string, text: string): CompanionState {
  return {
    ...state,
    log: [...state.log, { id: state.nextLogId, when, text }],
    nextLogId: state.nextLogId + 1,
  };
}

function logNow(state: CompanionState, text: string): CompanionState {
  return log(state, phaseLabel(state.phase), text);
}

function mapPlayer(
  state: CompanionState,
  seat: number,
  fn: (p: CompanionPlayer) => CompanionPlayer,
): CompanionState {
  return { ...state, players: state.players.map((p) => (p.seat === seat ? fn(p) : p)) };
}

export function playerAt(state: CompanionState, seat: number): CompanionPlayer {
  const p = state.players.find((x) => x.seat === seat);
  if (!p) throw new Error(`No player in seat ${seat}`);
  return p;
}

export function nameAt(state: CompanionState, seat: number): string {
  return playerAt(state, seat).name;
}

// ── Night queue ───────────────────────────────────────────────────────

export type NightStep =
  | { kind: "minion-info" }
  | { kind: "demon-info" }
  | { kind: "you-are-imp"; seat: number }
  | {
      kind: "wake";
      /**
       * The ability this player wakes for: their believed character for the
       * Drunk/Lunatic, the gained ability for an Apprentice, else their own.
       */
      character: CharacterId;
      seat: number;
      /** Waking player is secretly the Drunk/Lunatic — their ability is void. */
      isDrunk: boolean;
      /** Waking player is poisoned — their ability is void. */
      poisoned: boolean;
      /** Waking player is drunk from a BMR source — their ability is void. */
      drunk?: boolean;
    }
  // ── Bad Moon Rising steps ───────────────────────────────────────────
  /** The Lunatic's fake demon info on the first night. */
  | { kind: "lunatic-info"; seat: number }
  /** A newly seated Apprentice gains a Townsfolk/Minion ability. */
  | { kind: "apprentice"; seat: number }
  /** The Gossip's true statement — the Storyteller kills a player. */
  | { kind: "gossip-kill" }
  /** The Tinker might die at any time — the Storyteller's call. */
  | { kind: "tinker"; seat: number }
  /** The Moonchild's chosen player dies tonight if good. */
  | { kind: "moonchild-kill"; target: number }
  /** The Demon killed the grandchild — the Grandmother dies too. */
  | { kind: "grandmother-dies"; grandmotherSeat: number; grandchildSeat: number }
  /** The Exorcist blocked the Pukka, but last night's venom still kills. */
  | { kind: "pukka-victim"; target: number }
  | { kind: "dawn" };

/**
 * A step's stable identity — `<kind>` or `<kind>:<seat>`. A player wakes at
 * most once per night for their own ability, so a wake step is identified by
 * its SEAT alone: reducers can mark "this seat's step ran tonight" without
 * knowing which character the step was displayed as.
 */
export function nightStepId(step: NightStep): NightStepId {
  switch (step.kind) {
    case "wake":
    case "you-are-imp":
    case "lunatic-info":
    case "apprentice":
    case "tinker":
      return `${step.kind}:${step.seat}`;
    case "moonchild-kill":
    case "pukka-victim":
      return `${step.kind}:${step.target}`;
    case "grandmother-dies":
      return `${step.kind}:${step.grandmotherSeat}`;
    default:
      return step.kind;
  }
}

const wakeId = (seat: number): NightStepId => `wake:${seat}`;

/** The character a player wakes AS: believed (Drunk/Lunatic), gained (Apprentice), or own. */
export function wakeCharacter(p: CompanionPlayer): CharacterId {
  if (p.character === "apprentice" && p.apprenticeAbility) return p.apprenticeAbility;
  return apparentCharacter(p);
}

function wakeStep(state: CompanionState, p: CompanionPlayer): NightStep {
  return {
    kind: "wake",
    character: wakeCharacter(p),
    seat: p.seat,
    isDrunk: p.believedCharacter !== undefined,
    poisoned: p.poisoned,
    drunk: isDrunkPlayer(state, p),
  };
}

/**
 * Rebuild a step from its id. Only the steps whose trigger can VANISH after
 * they run need this (a Gambler who died on their guess, a spent Assassin, a
 * resolved Moonchild curse…); the info steps and dawn are always present.
 */
function stepFromId(state: CompanionState, id: NightStepId): NightStep | undefined {
  const [kind, seatText] = id.split(":");
  const seat = seatText === undefined ? undefined : Number(seatText);
  const player = seat === undefined ? undefined : state.players.find((p) => p.seat === seat);
  switch (kind) {
    case "minion-info":
    case "demon-info":
    case "gossip-kill":
    case "dawn":
      return { kind };
    case "wake":
      return player ? wakeStep(state, player) : undefined;
    case "you-are-imp":
    case "lunatic-info":
    case "apprentice":
    case "tinker":
      return player ? { kind, seat: player.seat } : undefined;
    case "moonchild-kill":
    case "pukka-victim":
      return player ? { kind, target: player.seat } : undefined;
    case "grandmother-dies":
      return player?.grandchild !== undefined
        ? { kind, grandmotherSeat: player.seat, grandchildSeat: player.grandchild }
        : undefined;
    default:
      return undefined;
  }
}

/** Has this step already booked its effect tonight? */
export function isStepResolved(state: CompanionState, step: NightStep): boolean {
  return state.nightProgress.resolved.includes(nightStepId(step));
}

/** Book a step as done for tonight. No-op outside the night. */
function markResolved(state: CompanionState, id: NightStepId): CompanionState {
  if (state.phase.kind !== "night" || state.nightProgress.resolved.includes(id)) return state;
  return {
    ...state,
    nightProgress: { ...state.nightProgress, resolved: [...state.nightProgress.resolved, id] },
  };
}

/** Book the wake step of the player in `seat` as done for tonight. */
function resolveWake(state: CompanionState, seat: number): CompanionState {
  return markResolved(state, wakeId(seat));
}

/**
 * Where a step sits on tonight's sheet — the position a resolved step is put
 * back at when the state change it caused would otherwise drop it from the
 * rebuilt queue. Negative ranks are the dusk/info block; dawn is last.
 */
function stepRank(state: CompanionState, step: NightStep): number {
  const night = state.phase.kind === "night" ? state.phase.night : 0;
  const bmr = state.script === "bad-moon-rising";
  const order = bmr
    ? night === 1
      ? BMR_FIRST_NIGHT_ORDER
      : BMR_OTHER_NIGHTS_ORDER
    : night === 1
      ? FIRST_NIGHT_ORDER
      : OTHER_NIGHTS_ORDER;
  const slot = (id: CharacterId) => {
    const i = order.indexOf(id);
    // TB travellers (Thief, Bureaucrat) wake at dusk, before the sheet.
    return i === -1 ? -10 : i;
  };
  switch (step.kind) {
    case "apprentice":
      return -20;
    case "minion-info":
      return -3;
    case "lunatic-info":
      return -2;
    case "demon-info":
      return -1;
    case "wake":
      return slot(step.character);
    case "you-are-imp":
      return slot("scarlet-woman");
    case "gossip-kill":
      return slot("gossip");
    case "tinker":
      return slot("tinker");
    case "moonchild-kill":
      return slot("moonchild");
    case "grandmother-dies":
      return slot("grandmother");
    case "pukka-victim":
      return slot("pukka");
    case "dawn":
      return Number.POSITIVE_INFINITY;
  }
}

/**
 * The full step list for the current night, following the boxed night sheet
 * with its skip rules (dead players don't wake; the Ravenkeeper wakes only
 * on the night they die; the Undertaker only after an execution day;
 * Minion/Demon info only on the first night with 7+ players). Recomputed
 * after every action — recording an Imp kill can add the Ravenkeeper's step
 * later in the same night.
 *
 * Steps that already RAN tonight always stay in the list: the Gambler who
 * died on their guess and the Assassin who just spent their strike no longer
 * satisfy the sheet's wake rules, but dropping them would yank the wizard to
 * the next step under the Storyteller's thumb.
 */
export function nightQueue(state: CompanionState): NightStep[] {
  if (state.phase.kind !== "night") return [];
  const natural = state.script === "bad-moon-rising" ? bmrNightQueue(state) : tbNightQueue(state);
  const present = new Set(natural.map(nightStepId));
  let queue = natural;
  for (const id of state.nightProgress.resolved) {
    if (present.has(id)) continue;
    const step = stepFromId(state, id);
    if (!step) continue;
    const rank = stepRank(state, step);
    // After the last natural step of the same or an earlier slot.
    let at = queue.length;
    for (let i = queue.length - 1; i >= 0; i--) {
      if (stepRank(state, queue[i]) <= rank) {
        at = i + 1;
        break;
      }
      at = i;
    }
    queue = [...queue.slice(0, at), step, ...queue.slice(at)];
    present.add(id);
  }
  return queue;
}

/**
 * The index of the step the Storyteller is on. A cursor that points at a
 * step which vanished unresolved (the Storyteller marked that player dead
 * from the Grimoire mid-night) lands on the next step of the sheet.
 */
export function nightCursorIndex(state: CompanionState, queue = nightQueue(state)): number {
  if (queue.length === 0) return 0;
  const cursor = state.nightProgress.cursor;
  if (cursor === undefined) return 0;
  const found = queue.findIndex((s) => nightStepId(s) === cursor);
  if (found !== -1) return found;
  const gone = stepFromId(state, cursor);
  if (!gone) return 0;
  const rank = stepRank(state, gone);
  const next = queue.findIndex((s) => stepRank(state, s) >= rank);
  return next === -1 ? queue.length - 1 : next;
}

/** The step under the Storyteller's thumb (undefined outside the night). */
export function currentNightStep(state: CompanionState): NightStep | undefined {
  const queue = nightQueue(state);
  return queue[nightCursorIndex(state, queue)];
}

/** Move to the step `delta` places away on tonight's sheet (clamped). */
export function moveNightCursor(state: CompanionState, delta: number): CompanionState {
  if (state.phase.kind !== "night") return state;
  const queue = nightQueue(state);
  if (queue.length === 0) return state;
  const at = Math.max(0, Math.min(queue.length - 1, nightCursorIndex(state, queue) + delta));
  return {
    ...state,
    nightProgress: { ...state.nightProgress, cursor: nightStepId(queue[at]) },
  };
}

function tbNightQueue(state: CompanionState): NightStep[] {
  const night = state.phase.kind === "night" ? state.phase.night : 0;
  const steps: NightStep[] = [];
  const wakers = (id: CharacterId) =>
    state.players.filter((p) => p.alive && wakeCharacter(p) === id);

  // Travellers that act (Thief, Bureaucrat) wake at DUSK, before everything
  // else on the sheet — every night, including the first.
  for (const id of ["thief", "bureaucrat"] as const) {
    for (const p of wakers(id)) steps.push(wakeStep(state, p));
  }

  if (night === 1) {
    // The 7+ threshold counts seated residents, not travellers.
    if (state.players.filter((p) => !isTraveller(p)).length >= 7) {
      steps.push({ kind: "minion-info" }, { kind: "demon-info" });
    }
    for (const id of FIRST_NIGHT_ORDER) {
      for (const p of wakers(id)) steps.push(wakeStep(state, p));
    }
  } else {
    for (const id of OTHER_NIGHTS_ORDER) {
      if (id === "scarlet-woman") {
        if (state.pendingImpInfo !== undefined) {
          steps.push({ kind: "you-are-imp", seat: state.pendingImpInfo });
        }
        continue;
      }
      if (id === "ravenkeeper") {
        // Wakes only on the night they die.
        for (const p of state.players) {
          if (p.diedTonight && wakeCharacter(p) === "ravenkeeper") {
            steps.push(wakeStep(state, p));
          }
        }
        continue;
      }
      if (id === "undertaker") {
        // Only the night after an execution day.
        if (state.lastExecution?.day === night - 1) {
          for (const p of wakers("undertaker")) steps.push(wakeStep(state, p));
        }
        continue;
      }
      for (const p of wakers(id)) steps.push(wakeStep(state, p));
    }
  }
  steps.push({ kind: "dawn" });
  return steps;
}

/**
 * Bad Moon Rising night queue (official night-sheet ordering). Wakers match
 * TRUE characters — the Lunatic (who believes they're the Demon) gets their
 * own step at the Lunatic's sheet position, never the Demon's. An Apprentice
 * who gained an ability wakes at that ability's slot. Non-waking Storyteller
 * kills (Gossip, Tinker, Moonchild, Grandmother) surface as reminder steps at
 * their sheet positions.
 */
function bmrNightQueue(state: CompanionState): NightStep[] {
  const night = state.phase.kind === "night" ? state.phase.night : 0;
  const steps: NightStep[] = [];
  const byId = (id: CharacterId) => state.players.filter((p) => p.alive && p.character === id);
  const push = (p: CompanionPlayer) => steps.push(wakeStep(state, p));

  // A newly seated Apprentice gains their ability at dusk of their 1st night.
  for (const p of state.players) {
    if (p.alive && p.character === "apprentice" && p.apprenticeAbility === undefined) {
      steps.push({ kind: "apprentice", seat: p.seat });
    }
  }
  // An Apprentice with a gained ability wakes whenever that character would.
  const apprentices = (id: CharacterId) =>
    state.players.filter(
      (p) => p.alive && p.character === "apprentice" && p.apprenticeAbility === id,
    );

  const lunatic = state.players.find((p) => p.alive && p.character === "lunatic");
  const demon = demonPlayer(state);

  if (night === 1) {
    if (state.players.filter((p) => !isTraveller(p)).length >= 7) {
      steps.push({ kind: "minion-info" });
      // The Lunatic gets their FAKE demon info right before the real thing.
      if (lunatic) steps.push({ kind: "lunatic-info", seat: lunatic.seat });
      steps.push({ kind: "demon-info" });
    } else if (lunatic?.believedCharacter === "pukka") {
      // Teensyville: no info steps — but a Lunatic who believes they're the
      // Pukka still wakes to "poison" someone on the first night.
      steps.push({ kind: "lunatic-info", seat: lunatic.seat });
    }
    for (const id of BMR_FIRST_NIGHT_ORDER) {
      for (const p of [...byId(id), ...apprentices(id)]) push(p);
    }
  } else {
    for (const id of BMR_OTHER_NIGHTS_ORDER) {
      switch (id) {
        case "courtier":
          for (const p of [...byId(id), ...apprentices(id)]) {
            if (!p.usedAbility) push(p);
          }
          break;
        case "lunatic":
          // Woken as the Demon they believe they are — so a "Zombuul" only
          // after a deathless day, like the real one.
          if (lunatic && (lunatic.believedCharacter !== "zombuul" || state.nightZombuulActs)) {
            push(lunatic);
          }
          break;
        case "zombuul":
          // Wakes only after a deathless day, and not while exorcised.
          if (demon?.character === "zombuul" && state.nightZombuulActs && !state.exorcisedDemon) {
            push(demon);
          }
          break;
        case "pukka":
          if (demon?.character === "pukka") {
            if (!state.exorcisedDemon) push(demon);
            else if (state.pukkaVictim !== undefined) {
              // Blocked Pukka doesn't wake, but last night's venom still kills.
              steps.push({ kind: "pukka-victim", target: state.pukkaVictim });
            }
          }
          break;
        case "shabaloth":
        case "po":
          if (demon?.character === id && !state.exorcisedDemon) push(demon);
          break;
        case "assassin":
        case "professor":
          for (const p of [...byId(id), ...apprentices(id)]) {
            if (!p.usedAbility) push(p);
          }
          break;
        case "godfather":
          if (state.outsiderDiedToday) {
            for (const p of [...byId(id), ...apprentices(id)]) push(p);
          }
          break;
        case "gossip":
          if (state.gossipTrue && byId("gossip").length > 0) {
            steps.push({ kind: "gossip-kill" });
          }
          break;
        case "tinker":
          for (const p of byId("tinker")) steps.push({ kind: "tinker", seat: p.seat });
          break;
        case "moonchild":
          if (state.moonchildTarget !== undefined) {
            steps.push({ kind: "moonchild-kill", target: state.moonchildTarget });
          }
          break;
        case "grandmother":
          for (const gm of byId("grandmother")) {
            if (
              gm.grandchild !== undefined &&
              playerAt(state, gm.grandchild).diedByDemonTonight &&
              !abilityVoid(state, gm)
            ) {
              steps.push({
                kind: "grandmother-dies",
                grandmotherSeat: gm.seat,
                grandchildSeat: gm.grandchild,
              });
            }
          }
          break;
        case "chambermaid":
          for (const p of [...byId(id), ...apprentices(id)]) {
            const others = state.players.filter((x) => x.alive && x.seat !== p.seat).length;
            if (others >= 2) push(p);
          }
          break;
        default:
          for (const p of [...byId(id), ...apprentices(id)]) push(p);
      }
    }
  }
  steps.push({ kind: "dawn" });
  return steps;
}

/**
 * Chambermaid: how many of the chosen seats woke TONIGHT due to their own
 * ability. Computed from the live night queue — info steps where someone is
 * woken by another ability (demon info, exorcist notification) don't count;
 * drunk/poisoned wakers do.
 */
export function chambermaidNumber(state: CompanionState, seats: number[]): number {
  const woke = new Set<number>();
  for (const step of nightQueue(state)) {
    if (step.kind === "wake" || step.kind === "lunatic-info" || step.kind === "apprentice") {
      woke.add(step.seat);
    }
  }
  return seats.filter((s) => woke.has(s)).length;
}

// ── Phase transitions ─────────────────────────────────────────────────

export function beginNight(state: CompanionState): CompanionState {
  const night =
    state.phase.kind === "day" ? state.phase.day + 1 : state.phase.kind === "reveal" ? 1 : 0;
  if (night === 0) return state;
  const tb = state.script === "trouble-brewing";
  // TB: Poisoner poison expires at dusk ("tonight and tomorrow day"), as do
  // the Bureaucrat/Thief vote marks. BMR: Pukka venom persists until death;
  // drunkenness ticks down one dusk at a time (Courtier starts at 3), and
  // the Devil's Advocate protection covered today only.
  let next: CompanionState = {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      poisoned: tb ? false : p.poisoned,
      tripleVote: undefined,
      negativeVote: undefined,
      drunkNights: p.drunkNights !== undefined && p.drunkNights > 1 ? p.drunkNights - 1 : undefined,
      drunkSource: p.drunkNights !== undefined && p.drunkNights > 1 ? p.drunkSource : undefined,
      survivesExecution: undefined,
    })),
    phase: { kind: "night", night },
    nightProgress: EMPTY_NIGHT,
    // The Zombuul only wakes after a day with no deaths at all.
    nightZombuulActs: state.phase.kind === "day" ? state.day.deaths === 0 : false,
    day: EMPTY_DAY,
  };
  // The Minstrel's everyone-is-drunk window closes at the second dusk.
  if (next.minstrelDrunkDay !== undefined && night >= next.minstrelDrunkDay + 2) {
    next = { ...next, minstrelDrunkDay: undefined };
  }
  next = logNow(next, night === 1 ? "The first night begins." : "Night falls.");
  return next;
}

/**
 * Dawn: announce deaths, clear night-scoped statuses, move to day. The
 * night's toll is kept on `lastNight` for the day's recap; the Demon's
 * choices become the Shabaloth's regurgitation menu and consume the Po's
 * charge (it chose SOMEONE tonight, so its "last choice" is no longer
 * no-one).
 */
export function dawn(state: CompanionState): CompanionState {
  if (state.phase.kind !== "night") return state;
  const died = state.players.filter((p) => p.diedTonight);
  const day = state.phase.night;
  const demon = demonPlayer(state);
  const choices = state.nightProgress.demonChoices;
  let next: CompanionState = {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      diedTonight: false,
      protectedTonight: false,
      safeTonight: undefined,
      diedByDemonTonight: undefined,
    })),
    phase: { kind: "day", day },
    nightProgress: EMPTY_NIGHT,
    lastNight: { night: state.phase.night, died: died.map((p) => p.seat) },
    pendingImpInfo: undefined,
    exorcisedDemon: undefined,
    gossipTrue: undefined,
    moonchildTarget: undefined,
    moonchildCurseVoid: undefined,
    outsiderDiedToday: undefined,
    nightZombuulActs: undefined,
    lunaticChoices: undefined,
    lunaticPoChargedNight:
      state.lunaticChoices && state.lunaticChoices.length > 0
        ? undefined
        : state.lunaticPoChargedNight,
    shabalothVictims: demon?.character === "shabaloth" && choices.length > 0 ? choices : undefined,
    poChargedNight: choices.length === 0 ? state.poChargedNight : undefined,
    day: EMPTY_DAY,
  };
  next = logNow(
    next,
    died.length === 0
      ? "Dawn breaks — nobody died tonight."
      : `Dawn breaks — died tonight: ${died.map((p) => p.name).join(", ")}.`,
  );
  return next;
}

export function endGame(state: CompanionState, winner: Alignment, reason: string): CompanionState {
  const next: CompanionState = { ...state, phase: { kind: "ended", winner, reason } };
  return log(
    next,
    phaseLabel(state.phase),
    `${winner === "good" ? "Good" : "Evil"} wins — ${reason}`,
  );
}

// ── Deaths & status ───────────────────────────────────────────────────

const CAUSE_LABEL: Record<DeathCause, string> = {
  execution: "executed",
  demon: "killed by the Demon",
  slayer: "slain by the Slayer",
  virgin: "executed by the Virgin's ability",
  gunslinger: "shot by the Gunslinger",
  exile: "exiled",
  storyteller: "died",
  assassin: "assassinated",
  godfather: "killed by the Godfather",
  gambler: "died gambling on a wrong guess",
  moonchild: "died to the Moonchild's curse",
  gossip: "died because the Gossip spoke true",
  tinker: "died in an unfortunate accident",
  grandmother: "died of grief for their grandchild",
};

/** Book an execution that did NOT kill (Sailor, Fool, Tea Lady, DA, Pacifist…). */
export function survivedExecution(
  state: CompanionState,
  seat: number,
  reason: string,
): CompanionState {
  let next = logNow(
    state,
    `${nameAt(state, seat)} is executed but remains alive (${reason}) — never say why. That was today's execution.`,
  );
  next = { ...next, day: { ...next.day, executed: seat } };
  return next;
}

/**
 * A rule-fixed reason a death does not happen. `kill` enforces every one of
 * these on its own (the Assassin pierces them all, and so does the
 * Storyteller's boss button — "Mark dead" in the Grimoire); the wizard shows
 * them as hints BEFORE the tap so the Storyteller knows what to announce.
 */
export type Protection =
  | "monk"
  | "soldier"
  | "innkeeper"
  | "sober-sailor"
  | "tea-lady"
  | "devils-advocate"
  | "fool";

export const PROTECTION_TEXT: Record<Protection, string> = {
  monk: "protected by the Monk",
  soldier: "the Soldier is safe from the Demon",
  innkeeper: "protected by the Innkeeper",
  "sober-sailor": "the sober Sailor cannot die",
  "tea-lady": "protected by the Tea Lady",
  "devils-advocate": "the Devil's Advocate's client",
  fool: "the Fool's first death",
};

/**
 * Every protection that applies to `p` dying of `cause` right now, in the
 * order the engine consults them. Trouble Brewing's Monk and Soldier only
 * ward off the Demon; Bad Moon Rising's shields stop any non-piercing cause.
 */
export function deathProtections(
  state: CompanionState,
  p: CompanionPlayer,
  cause: DeathCause,
): Protection[] {
  const out: Protection[] = [];
  const atNight = state.phase.kind === "night";
  const sober = !abilityVoid(state, p);
  if (state.script === "trouble-brewing") {
    if (cause !== "demon") return out;
    if (p.protectedTonight && atNight) out.push("monk");
    if (p.character === "soldier" && sober) out.push("soldier");
    return out;
  }
  if (p.safeTonight && atNight) out.push("innkeeper");
  if (p.character === "sailor" && sober) out.push("sober-sailor");
  if (teaLadyProtectedSeats(state).includes(p.seat)) out.push("tea-lady");
  if (cause === "execution" && p.survivesExecution) out.push("devils-advocate");
  if (p.character === "fool" && !p.usedAbility && sober) out.push("fool");
  return out;
}

function deathProtection(
  state: CompanionState,
  p: CompanionPlayer,
  cause: DeathCause,
): Protection | undefined {
  return deathProtections(state, p, cause)[0];
}

export function kill(state: CompanionState, seat: number, cause: DeathCause): CompanionState {
  const p = playerAt(state, seat);
  // A registers-dead Zombuul is shown as dead but can (finally) die for real.
  if (!p.alive && !p.registersDead) return state;
  const atNight = state.phase.kind === "night";
  const bypass = cause === "assassin" || cause === "storyteller";

  if (p.alive && !bypass) {
    const protection = deathProtection(state, p, cause);
    if (protection) {
      // The Fool spends their once-per-game escape; other saves are free.
      const next =
        protection === "fool"
          ? mapPlayer(state, seat, (x) => ({ ...x, usedAbility: true }))
          : state;
      const reason = PROTECTION_TEXT[protection];
      return cause === "execution"
        ? survivedExecution(next, seat, reason)
        : logNow(next, `${p.name} would die — but doesn't (${reason}).`);
    }
    // The Zombuul's first death is fake: they register as dead but live on.
    if (p.character === "zombuul" && !p.registersDead && !abilityVoid(state, p)) {
      let next = mapPlayer(state, seat, (x) => ({
        ...x,
        alive: false,
        registersDead: true,
        diedTonight: atNight,
      }));
      next = logNow(
        next,
        `${p.name} appears to die (${CAUSE_LABEL[cause]}) — the Zombuul secretly lives.`,
      );
      // The fake death counts as "someone died today" and as the execution.
      if (!atNight) next = { ...next, day: { ...next.day, deaths: next.day.deaths + 1 } };
      if (cause === "execution" || cause === "virgin") {
        next = { ...next, day: { ...next.day, executed: seat } };
      }
      return next;
    }
  }

  let next = mapPlayer(state, seat, (x) => ({
    ...x,
    alive: false,
    registersDead: undefined,
    diedTonight: atNight,
    diedByDemonTonight: atNight && cause === "demon" ? true : undefined,
    poisoned: false,
    protectedTonight: false,
    safeTonight: undefined,
    survivesExecution: undefined,
    // A dead Beggar loses all accumulated tokens (they get a normal ghost vote).
    beggarTokens: undefined,
  }));
  // Death removes abilities immediately: a dead Bureaucrat/Thief's vote mark
  // vanishes from whoever carries it (exile included), a dead Poisoner's
  // victim is instantly sober, a dead Monk's ward loses protection, and any
  // BMR drunkenness caused by the dead player's ability (Sailor, Innkeeper,
  // Courtier, Goon) ends on the spot.
  if (p.character === "bureaucrat") {
    next = { ...next, players: next.players.map((x) => ({ ...x, tripleVote: undefined })) };
  }
  if (p.character === "thief") {
    next = { ...next, players: next.players.map((x) => ({ ...x, negativeVote: undefined })) };
  }
  if (p.character === "poisoner") {
    next = { ...next, players: next.players.map((x) => ({ ...x, poisoned: false })) };
  }
  if (p.character === "monk") {
    next = { ...next, players: next.players.map((x) => ({ ...x, protectedTonight: false })) };
  }
  next = {
    ...next,
    players: next.players.map((x) =>
      x.drunkSource === p.character ? { ...x, drunkNights: undefined, drunkSource: undefined } : x,
    ),
  };
  if (p.character === "minstrel") next = { ...next, minstrelDrunkDay: undefined };
  if (state.pukkaVictim === seat) next = { ...next, pukkaVictim: undefined };
  next = logNow(next, `${p.name} ${CAUSE_LABEL[cause]}.`);

  // A dead Moonchild must immediately and publicly curse an alive player.
  if (p.character === "moonchild" && state.script === "bad-moon-rising") {
    next = { ...next, moonchildPending: seat };
  }
  if (!atNight) {
    next = { ...next, day: { ...next.day, deaths: next.day.deaths + 1 } };
    // The Godfather avenges Outsiders that die during the day (any cause).
    if (
      state.script === "bad-moon-rising" &&
      CHARACTERS[p.character].type === "outsider" &&
      next.players.some((x) => x.alive && x.character === "godfather")
    ) {
      next = { ...next, outsiderDiedToday: true };
    }
  }
  if (cause === "execution" || cause === "virgin") {
    const day = state.phase.kind === "day" ? state.phase.day : 0;
    next = {
      ...next,
      lastExecution: { day, seat, character: p.character },
      day: { ...next.day, executed: seat },
    };
    // A Minion executed with a sober Minstrel in play: everyone else is
    // drunk until dusk tomorrow.
    const minstrel = next.players.find((x) => x.alive && x.character === "minstrel");
    if (
      state.script === "bad-moon-rising" &&
      CHARACTERS[p.character].type === "minion" &&
      minstrel &&
      !abilityVoid(next, minstrel)
    ) {
      next = { ...next, minstrelDrunkDay: day };
      next = logNow(
        next,
        "A Minion died by execution — the Minstrel plays: everyone (except Travellers) is drunk until dusk tomorrow.",
      );
    }
  }
  return next;
}

export function revive(state: CompanionState, seat: number): CompanionState {
  const p = playerAt(state, seat);
  if (p.alive) return state;
  let next = mapPlayer(state, seat, (x) => ({
    ...x,
    alive: true,
    diedTonight: false,
    registersDead: undefined,
  }));
  next = logNow(next, `${p.name} returns to life.`);
  return next;
}

export function setPoison(state: CompanionState, seat: number | undefined): CompanionState {
  // "You are sober and healthy" — the Beggar cannot be poisoned.
  if (seat !== undefined && playerAt(state, seat).character === "beggar") {
    return logNow(
      state,
      `The Poisoner chose ${nameAt(state, seat)} — but the Beggar cannot be poisoned.`,
    );
  }
  let next: CompanionState = {
    ...state,
    players: state.players.map((p) => ({ ...p, poisoned: p.seat === seat })),
  };
  if (seat !== undefined) {
    next = logNow(next, `${nameAt(state, seat)} is poisoned tonight and tomorrow day.`);
  }
  return next;
}

export function setMonkProtection(state: CompanionState, seat: number | undefined): CompanionState {
  let next: CompanionState = {
    ...state,
    players: state.players.map((p) => ({ ...p, protectedTonight: p.seat === seat })),
  };
  if (seat !== undefined) {
    next = logNow(next, `${nameAt(state, seat)} is protected by the Monk tonight.`);
  }
  return next;
}

export function setButlerMaster(
  state: CompanionState,
  butlerSeat: number,
  masterSeat: number,
): CompanionState {
  let next = mapPlayer(state, butlerSeat, (p) => ({ ...p, butlerMaster: masterSeat }));
  next = logNow(
    next,
    `${nameAt(state, butlerSeat)} chose ${nameAt(state, masterSeat)} as their master.`,
  );
  return next;
}

/** Bureaucrat's nightly pick — that player's vote counts as 3 tomorrow. */
export function setTripleVote(state: CompanionState, seat: number | undefined): CompanionState {
  let next: CompanionState = {
    ...state,
    players: state.players.map((p) => ({ ...p, tripleVote: p.seat === seat ? true : undefined })),
  };
  if (seat !== undefined) {
    next = logNow(next, `${nameAt(state, seat)}'s vote counts as 3 votes tomorrow (Bureaucrat).`);
  }
  return next;
}

/** Thief's nightly pick — that player's vote counts as −1 tomorrow. */
export function setNegativeVote(state: CompanionState, seat: number | undefined): CompanionState {
  let next: CompanionState = {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      negativeVote: p.seat === seat ? true : undefined,
    })),
  };
  if (seat !== undefined) {
    next = logNow(next, `${nameAt(state, seat)}'s vote counts NEGATIVELY tomorrow (Thief).`);
  }
  return next;
}

// ── Travellers ────────────────────────────────────────────────────────

/**
 * A traveller joins mid-game (or right at the start). Their character is
 * public; their alignment is the Storyteller's secret call. They take the
 * seat between the current last seat and seat 1 — the physical chair decides
 * the real neighbours, so seat them there (or note otherwise).
 */
export function addTraveller(
  state: CompanionState,
  name: string,
  character: CharacterId,
  alignment: Alignment,
  opts: {
    /** The chair they take is right after this seat (clockwise); null = the first chair. Default: last. */
    afterSeat?: number | null;
  } = {},
): CompanionState {
  if (CHARACTERS[character].type !== "traveller") {
    throw new Error(`${character} is not a traveller`);
  }
  // A dead traveller's token is still in play — only a departed one frees it.
  if (state.players.some((p) => !p.left && p.character === character)) {
    throw new Error(`the ${CHARACTERS[character].name} is already in play`);
  }
  const player: CompanionPlayer = {
    seat: state.players.length,
    name,
    character,
    alive: true,
    ghostVote: true,
    poisoned: false,
    protectedTonight: false,
    redHerring: false,
    usedAbility: false,
    diedTonight: false,
    alignment,
  };
  let next: CompanionState = { ...state, players: [...state.players, player] };
  if (opts.afterSeat !== undefined) {
    const order = orderMoving(next, player.seat, opts.afterSeat);
    if (order) next = reorderSeats(next, order);
  }
  const seat = next.players.findIndex((p) => p.name === name && p.character === character);
  const n = next.players.length;
  const left = next.players[(seat - 1 + n) % n];
  const right = next.players[(seat + 1) % n];
  return logNow(
    next,
    `${name} joins town as the ${CHARACTERS[character].name} (${alignment}) — seated between ${left.name} and ${right.name}.`,
  );
}

/** Flip a traveller's (or the BMR Goon's) secret alignment (ST override). */
export function setTravellerAlignment(
  state: CompanionState,
  seat: number,
  alignment: Alignment,
): CompanionState {
  const p = playerAt(state, seat);
  if (!isTraveller(p) && p.character !== "goon") return state;
  let next = mapPlayer(state, seat, (x) => ({ ...x, alignment }));
  next = logNow(next, `${p.name} is now ${alignment}.`);
  return next;
}

/**
 * Exile: the town votes a traveller out (≥ half of ALL players; not an
 * execution — the day continues, the Undertaker learns nothing, and any
 * number of exiles can happen per day). The exiled traveller is dead and
 * keeps a ghost vote like anyone else.
 */
export function exileTraveller(state: CompanionState, seat: number): CompanionState {
  return kill(state, seat, "exile");
}

/**
 * A traveller leaves town entirely (the player goes home). Unlike death they
 * are gone: no ghost vote, no votes, excluded from every count and picker.
 */
export function removeTraveller(state: CompanionState, seat: number): CompanionState {
  const p = playerAt(state, seat);
  let next = mapPlayer(state, seat, (x) => ({
    ...x,
    alive: false,
    left: true,
    ghostVote: false,
    diedTonight: false,
    poisoned: false,
    protectedTonight: false,
    beggarTokens: undefined,
  }));
  if (p.character === "bureaucrat") {
    next = { ...next, players: next.players.map((x) => ({ ...x, tripleVote: undefined })) };
  }
  if (p.character === "thief") {
    next = { ...next, players: next.players.map((x) => ({ ...x, negativeVote: undefined })) };
  }
  return logNow(next, `${p.name} leaves town.`);
}

/**
 * A dead player hands the Beggar their ghost vote token. The Beggar gains a
 * token and (via the Storyteller) learns the donor's alignment; the donor can
 * no longer vote.
 */
export function giveBeggarToken(state: CompanionState, donorSeat: number): CompanionState {
  const beggar = state.players.find((p) => p.alive && p.character === "beggar");
  const donor = playerAt(state, donorSeat);
  if (!beggar || donor.alive || !donor.ghostVote) return state;
  let next = mapPlayer(state, donorSeat, (x) => ({ ...x, ghostVote: false }));
  next = mapPlayer(next, beggar.seat, (x) => ({
    ...x,
    beggarTokens: (x.beggarTokens ?? 0) + 1,
  }));
  next = logNow(
    next,
    `${donor.name} gave their vote token to the Beggar, who learns they are ${
      isEvilPlayer(donor) ? "EVIL" : "GOOD"
    }.`,
  );
  return next;
}

/**
 * The Gunslinger's public day kill: after the first vote is tallied they may
 * choose a player that voted — that player dies. NOT an execution: the day
 * continues and the Undertaker learns nothing. Once per day.
 */
export function recordGunslingerShot(state: CompanionState, target: number): CompanionState {
  let next = kill(state, target, "gunslinger");
  next = { ...next, day: { ...next.day, gunslingerUsed: true } };
  return next;
}

/**
 * The Scapegoat's redirect: a player of their alignment is about to be
 * executed and the Storyteller executes the Scapegoat instead. This IS the
 * day's one execution (the Undertaker sees a Scapegoat), and the saved player
 * lives.
 */
export function executeScapegoatInstead(state: CompanionState, savedSeat: number): CompanionState {
  const scapegoat = state.players.find((p) => p.alive && p.character === "scapegoat");
  if (!scapegoat) return state;
  let next = logNow(state, `The Scapegoat is executed in place of ${nameAt(state, savedSeat)}.`);
  next = kill(next, scapegoat.seat, "execution");
  return settleExecution(state, next, scapegoat.seat);
}

export function spendGhostVote(state: CompanionState, seat: number): CompanionState {
  const p = playerAt(state, seat);
  if (p.alive || !p.ghostVote) return state;
  let next = mapPlayer(state, seat, (x) => ({ ...x, ghostVote: false }));
  next = logNow(next, `${p.name} spent their ghost vote.`);
  return next;
}

export function restoreGhostVote(state: CompanionState, seat: number): CompanionState {
  return mapPlayer(state, seat, (x) => ({ ...x, ghostVote: true }));
}

/**
 * The tokens a tallied vote consumes: each dead voter's ghost vote, and one
 * of the Beggar's donated tokens per Beggar vote. Under the Voudon the dead
 * vote freely and spend nothing.
 */
export function spendVoteTokens(state: CompanionState, voters: readonly number[]): CompanionState {
  if (voudonActive(state)) return state;
  const spent: string[] = [];
  let next: CompanionState = {
    ...state,
    players: state.players.map((p) => {
      if (!voters.includes(p.seat)) return p;
      if (!p.alive && p.ghostVote) {
        spent.push(`${p.name} (ghost vote)`);
        return { ...p, ghostVote: false };
      }
      if (p.alive && p.character === "beggar" && (p.beggarTokens ?? 0) > 0) {
        spent.push(`${p.name} (Beggar token)`);
        return { ...p, beggarTokens: (p.beggarTokens ?? 0) - 1 };
      }
      return p;
    }),
  };
  if (spent.length > 0) next = logNow(next, `Vote tokens spent: ${spent.join(", ")}.`);
  return next;
}

export function markAbilityUsed(state: CompanionState, seat: number): CompanionState {
  return mapPlayer(state, seat, (x) => ({ ...x, usedAbility: true }));
}

export function setNote(state: CompanionState, seat: number, note: string): CompanionState {
  return mapPlayer(state, seat, (x) => ({ ...x, note: note || undefined }));
}

/**
 * Book what the Storyteller told a player tonight (next to the truth). One
 * entry per night: recording again tonight corrects the earlier one.
 */
export function recordInfoGiven(
  state: CompanionState,
  seat: number,
  told: string,
  truth?: string,
): CompanionState {
  if (state.phase.kind !== "night") return state;
  const night = state.phase.night;
  const p = playerAt(state, seat);
  const entry = { night, told, ...(truth !== undefined ? { truth } : {}) };
  const kept = (p.infoGiven ?? []).filter((e) => e.night !== night);
  const next = mapPlayer(state, seat, (x) => ({ ...x, infoGiven: [...kept, entry] }));
  const as = CHARACTERS[wakeCharacter(p)].name;
  const truthNote = truth !== undefined && truth !== told ? ` (true: ${truth})` : "";
  return logNow(next, `Told ${p.name} (${as}): ${told}${truthNote}.`);
}

/** What this player was told tonight, if recorded. */
export function infoGivenTonight(
  state: CompanionState,
  seat: number,
): { told: string; truth?: string } | undefined {
  if (state.phase.kind !== "night") return undefined;
  const night = state.phase.night;
  return playerAt(state, seat).infoGiven?.find((e) => e.night === night);
}

/**
 * Swap a player's character mid-game (Scarlet Woman promotion, Imp star
 * pass). Becoming the Imp queues a "you are the Imp" info step for tonight.
 */
export function changeCharacter(
  state: CompanionState,
  seat: number,
  character: CharacterId,
): CompanionState {
  const p = playerAt(state, seat);
  let next = mapPlayer(state, seat, (x) => ({
    ...x,
    character,
    believedCharacter: undefined,
    usedAbility: false,
  }));
  // Losing a character ends its ongoing effects: "the Poisoner poisons the
  // Mayor, then becomes the Imp — the Mayor is no longer poisoned" (wiki).
  if (p.character === "poisoner" && character !== "poisoner") {
    next = { ...next, players: next.players.map((x) => ({ ...x, poisoned: false })) };
  }
  if (p.character === "monk" && character !== "monk") {
    next = { ...next, players: next.players.map((x) => ({ ...x, protectedTonight: false })) };
  }
  next = logNow(
    next,
    `${p.name} becomes the ${CHARACTERS[character].name} (was the ${CHARACTERS[p.character].name}).`,
  );
  if (character === "imp") next = { ...next, pendingImpInfo: seat };
  return next;
}

/** Record the Demon's night choice, with the outcome the Storyteller resolved. */
export function recordDemonKill(
  state: CompanionState,
  target: number,
  outcome: "dies" | "safe",
  note?: string,
): CompanionState {
  const demon = demonPlayer(state);
  const demonName = CHARACTERS[demon?.character ?? "imp"].name;
  const targetName = nameAt(state, target);
  let next = state;
  if (outcome === "safe") {
    next = logNow(
      next,
      `The ${demonName} chose ${targetName} — no one died${note ? ` (${note})` : ""}.`,
    );
  } else {
    next = kill(next, target, "demon");
    if (note) next = logNow(next, note);
  }
  return recordDemonChoice(next, demon, target);
}

/**
 * Book one of the Demon's picks tonight. The Demon's wake step is done once
 * it has made every pick its ability grants (Shabaloth two, a charged Po
 * three, everyone else one) — the wizard reads that here, never from React
 * state, so a tab switch or a refresh can't re-offer the attack.
 */
function recordDemonChoice(
  state: CompanionState,
  demon: CompanionPlayer | undefined,
  target: number,
): CompanionState {
  if (state.phase.kind !== "night") return state;
  const demonChoices = [...state.nightProgress.demonChoices, target];
  let next: CompanionState = {
    ...state,
    nightProgress: { ...state.nightProgress, demonChoices },
  };
  if (demon && demonChoices.length >= demonAttacksWanted(state)) {
    next = resolveWake(next, demon.seat);
  }
  return next;
}

/** The Po chose no-one on an earlier night and hasn't attacked since. */
export function poChargeActive(state: CompanionState): boolean {
  const charged = state.poChargedNight;
  if (charged === undefined) return false;
  return state.phase.kind !== "night" || state.phase.night > charged;
}

/** How many players the Demon points at tonight. */
export function demonAttacksWanted(state: CompanionState): number {
  const demon = demonPlayer(state);
  if (demon?.character === "shabaloth") return 2;
  if (demon?.character === "po") return poChargeActive(state) ? 3 : 1;
  return 1;
}

/** The Demon's attack progress tonight, for the wizard's demon step. */
export function demonAttackStatus(state: CompanionState): {
  wanted: number;
  choices: number[];
  done: boolean;
} {
  const wanted = demonAttacksWanted(state);
  const choices = state.nightProgress.demonChoices;
  // A Po that charged up chose no one — the step is done with zero picks.
  const demon = demonPlayer(state);
  const acted = demon !== undefined && state.nightProgress.resolved.includes(wakeId(demon.seat));
  return { wanted, choices, done: acted || choices.length >= wanted };
}

// ── Bad Moon Rising night actions ─────────────────────────────────────

/** Make a player drunk from a character's ability, for N dusks. */
export function setDrunk(
  state: CompanionState,
  seat: number,
  nights: number,
  source: CharacterId,
): CompanionState {
  let next = mapPlayer(state, seat, (x) => ({ ...x, drunkNights: nights, drunkSource: source }));
  next = logNow(
    next,
    `${nameAt(state, seat)} is drunk (${CHARACTERS[source].name}${
      nights > 1 ? `, ${nights} nights & days` : ""
    }).`,
  );
  return next;
}

export function clearDrunk(state: CompanionState, seat: number): CompanionState {
  return mapPlayer(state, seat, (x) => ({
    ...x,
    drunkNights: undefined,
    drunkSource: undefined,
  }));
}

/** Sailor's nightly pick: either the Sailor or the chosen player gets drunk. */
export function recordSailorChoice(
  state: CompanionState,
  sailorSeat: number,
  targetSeat: number,
  whoIsDrunk: "sailor" | "target",
): CompanionState {
  let next = logNow(state, `The Sailor went drinking with ${nameAt(state, targetSeat)}.`);
  next = setDrunk(next, whoIsDrunk === "sailor" ? sailorSeat : targetSeat, 1, "sailor");
  return resolveWake(next, sailorSeat);
}

/** Innkeeper's nightly pick: two guests safe tonight, one of them drunk. */
export function recordInnkeeperChoice(
  state: CompanionState,
  innkeeperSeat: number,
  guests: [number, number],
  drunkSeat: number,
): CompanionState {
  let next: CompanionState = {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      safeTonight: guests.includes(p.seat) ? true : p.safeTonight,
    })),
  };
  next = logNow(
    next,
    `The Innkeeper hosts ${guests.map((s) => nameAt(state, s)).join(" and ")} — safe tonight.`,
  );
  next = setDrunk(next, drunkSeat, 1, "innkeeper");
  return resolveWake(next, innkeeperSeat);
}

/** Courtier's once-per-game pick: a CHARACTER is drunk for 3 nights & days. */
export function recordCourtierChoice(
  state: CompanionState,
  courtierSeat: number,
  character: CharacterId,
): CompanionState {
  let next = resolveWake(markAbilityUsed(state, courtierSeat), courtierSeat);
  next = logNow(next, `The Courtier wines and dines the ${CHARACTERS[character].name}.`);
  if (abilityVoid(state, playerAt(state, courtierSeat))) {
    return logNow(next, "The Courtier's ability is void — nothing happens (and it is spent).");
  }
  const target = next.players.find((p) => !p.left && p.character === character);
  if (!target) {
    return logNow(next, `The ${CHARACTERS[character].name} is not in play — nothing happens.`);
  }
  return setDrunk(next, target.seat, 3, "courtier");
}

/** Gambler's nightly guess. A wrong guess kills them (if their ability works). */
export function recordGamblerGuess(
  state: CompanionState,
  gamblerSeat: number,
  targetSeat: number,
  guess: CharacterId,
): CompanionState {
  const target = playerAt(state, targetSeat);
  const correct = target.character === guess;
  let next = logNow(
    resolveWake(state, gamblerSeat),
    `The Gambler guessed ${target.name} is the ${CHARACTERS[guess].name} — ${
      correct ? "correct" : "WRONG"
    }.`,
  );
  if (!correct && !abilityVoid(state, playerAt(state, gamblerSeat))) {
    next = kill(next, gamblerSeat, "gambler");
  }
  return next;
}

/** Exorcist's nightly pick. Choosing the Demon blocks their wake tonight. */
export function recordExorcistChoice(
  state: CompanionState,
  exorcistSeat: number,
  targetSeat: number,
): CompanionState {
  const target = playerAt(state, targetSeat);
  const exorcist = playerAt(state, exorcistSeat);
  let next = mapPlayer(state, exorcistSeat, (x) => ({ ...x, lastChoice: targetSeat }));
  next = resolveWake(next, exorcistSeat);
  next = logNow(next, `The Exorcist chose ${target.name}.`);
  const isDemon =
    CHARACTERS[target.character].type === "demon" && (target.alive || target.registersDead);
  if (isDemon && !abilityVoid(state, exorcist)) {
    next = { ...next, exorcisedDemon: true };
    next = logNow(
      next,
      `${target.name} IS the Demon — wake them, show them the Exorcist, and they do not act tonight.`,
    );
  }
  return next;
}

/** Devil's Advocate's nightly pick: that player survives execution tomorrow. */
export function recordAdvocateChoice(
  state: CompanionState,
  advocateSeat: number,
  targetSeat: number,
): CompanionState {
  const advocate = playerAt(state, advocateSeat);
  // The pick is recorded even when drunk (they still can't repeat it), but a
  // voided Advocate grants no protection.
  if (abilityVoid(state, advocate)) {
    const next = mapPlayer(state, advocateSeat, (x) => ({ ...x, lastChoice: targetSeat }));
    return logNow(
      resolveWake(next, advocateSeat),
      `The Devil's Advocate chose ${nameAt(state, targetSeat)} — no protection (ability void).`,
    );
  }
  let next: CompanionState = {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      survivesExecution: p.seat === targetSeat ? true : undefined,
    })),
  };
  next = mapPlayer(next, advocateSeat, (x) => ({ ...x, lastChoice: targetSeat }));
  return logNow(
    resolveWake(next, advocateSeat),
    `The Devil's Advocate protects ${nameAt(state, targetSeat)} — they survive execution tomorrow.`,
  );
}

/** Assassin's once-per-game kill — pierces every protection. */
export function recordAssassinKill(
  state: CompanionState,
  assassinSeat: number,
  targetSeat: number,
): CompanionState {
  let next = resolveWake(markAbilityUsed(state, assassinSeat), assassinSeat);
  const assassin = playerAt(state, assassinSeat);
  if (abilityVoid(state, assassin)) {
    next = logNow(next, "The Assassin strikes — but their ability is void. Nothing happens.");
    // The Goon still flips the Assassin's alignment even on a voided strike.
    return next;
  }
  return kill(next, targetSeat, "assassin");
}

/** Godfather's revenge kill the night after an Outsider died. */
export function recordGodfatherKill(
  state: CompanionState,
  godfatherSeat: number,
  targetSeat: number,
): CompanionState {
  return kill(resolveWake(state, godfatherSeat), targetSeat, "godfather");
}

/** Professor's once-per-game resurrection: dead Townsfolk only. */
export function recordProfessorChoice(
  state: CompanionState,
  professorSeat: number,
  targetSeat: number,
): CompanionState {
  let next = resolveWake(markAbilityUsed(state, professorSeat), professorSeat);
  const target = playerAt(state, targetSeat);
  const professor = playerAt(state, professorSeat);
  next = logNow(next, `The Professor works on ${target.name}…`);
  if (abilityVoid(state, professor)) {
    return logNow(next, "The Professor's ability is void — nothing happens (and it is spent).");
  }
  if (CHARACTERS[target.character].type !== "townsfolk") {
    return logNow(next, `${target.name} is not a Townsfolk — nothing happens.`);
  }
  return revive(next, targetSeat);
}

/** Grandmother's grandchild, learned on the first night. */
export function setGrandchild(
  state: CompanionState,
  grandmotherSeat: number,
  childSeat: number,
): CompanionState {
  const next = mapPlayer(state, grandmotherSeat, (x) => ({ ...x, grandchild: childSeat }));
  const child = playerAt(state, childSeat);
  return logNow(
    resolveWake(next, grandmotherSeat),
    `The Grandmother learns their grandchild: ${child.name} (${CHARACTERS[child.character].name}).`,
  );
}

/**
 * The Pukka's nightly pick, in the order the ability text fixes: "choose a
 * player: they are poisoned. The previously poisoned player dies, then
 * becomes healthy." Last night's victim dies FIRST (the edition's protections
 * — Innkeeper, sober Sailor, Tea Lady, Fool — bounce the kill inside `kill`
 * and the venom is purged either way), then the new target is poisoned. A
 * voided Pukka goes through `recordDemonKill(…, "safe")` instead: it poisons
 * no one and last night's victim keeps carrying the venom.
 */
export function recordPukkaPoison(state: CompanionState, targetSeat: number): CompanionState {
  const demon = demonPlayer(state);
  let next = state;
  const previous = state.pukkaVictim;
  if (previous !== undefined) {
    next = kill(next, previous, "demon");
    if (playerAt(next, previous).alive) {
      next = mapPlayer(next, previous, (x) => ({ ...x, poisoned: false }));
      next = logNow(next, `${nameAt(state, previous)} shakes off the Pukka's venom.`);
    }
  }
  const target = playerAt(next, targetSeat);
  if (target.alive) {
    next = mapPlayer(next, targetSeat, (x) => ({ ...x, poisoned: true }));
    next = { ...next, pukkaVictim: targetSeat };
    next = logNow(next, `The Pukka poisons ${target.name}.`);
  } else {
    next = { ...next, pukkaVictim: undefined };
    next = logNow(next, `The Pukka chose ${target.name} — already dead, no venom.`);
  }
  return recordDemonChoice(next, demon, targetSeat);
}

/**
 * The exorcised Pukka's leftover: it doesn't wake, but last night's victim
 * still dies (then becomes healthy) — or was protected, in which case the
 * venom is purged and they stay alive. The Storyteller's call either way.
 */
export function resolvePukkaVictim(
  state: CompanionState,
  victimSeat: number,
  dies: boolean,
): CompanionState {
  let next = state;
  if (dies) {
    next = kill(next, victimSeat, "demon");
    // If a protection bounced the kill inside `kill`, purge the venom anyway.
    if (playerAt(next, victimSeat).alive) {
      next = mapPlayer(next, victimSeat, (x) => ({ ...x, poisoned: false }));
    }
  } else {
    next = mapPlayer(next, victimSeat, (x) => ({ ...x, poisoned: false }));
    next = logNow(next, `${nameAt(state, victimSeat)} shakes off the Pukka's venom — no death.`);
  }
  if (next.pukkaVictim === victimSeat) next = { ...next, pukkaVictim: undefined };
  return markResolved(next, `pukka-victim:${victimSeat}`);
}

/**
 * The Shabaloth vomits one of last night's picks back to life. Once per
 * night: the menu (`shabalothVictims`) is consumed by the choice.
 */
export function regurgitate(state: CompanionState, seat: number): CompanionState {
  let next = revive(state, seat);
  next = logNow(next, `${nameAt(state, seat)} was regurgitated by the Shabaloth.`);
  return { ...next, shabalothVictims: undefined };
}

/**
 * The Po holds back tonight — three attacks the next time it wakes. The
 * charge is consumed at the dawn after a night the Po pointed at someone.
 */
export function recordPoCharge(state: CompanionState): CompanionState {
  if (state.phase.kind !== "night") return state;
  const demon = demonPlayer(state);
  let next: CompanionState = { ...state, poChargedNight: state.phase.night };
  next = logNow(next, "The Po chose no one — it will make THREE attacks next time it wakes.");
  return demon ? resolveWake(next, demon.seat) : next;
}

/**
 * The Goon's ward: the first player to choose them tonight goes drunk, and
 * the Goon flips to that player's alignment.
 */
export function recordGoonTrigger(state: CompanionState, chooserSeat: number): CompanionState {
  const goon = state.players.find((p) => !p.left && p.character === "goon");
  if (!goon) return state;
  const chooser = playerAt(state, chooserSeat);
  const alignment: Alignment = isEvilPlayer(chooser) ? "evil" : "good";
  let next = setDrunk(state, chooserSeat, 1, "goon");
  next = mapPlayer(next, goon.seat, (x) => ({ ...x, alignment }));
  return logNow(
    next,
    `${chooser.name} chose the Goon — they are drunk until dusk, and the Goon is now ${alignment.toUpperCase()}.`,
  );
}

/** The Apprentice gains a Townsfolk (good) or Minion (evil) ability. */
export function setApprenticeAbility(
  state: CompanionState,
  seat: number,
  character: CharacterId,
): CompanionState {
  const next = mapPlayer(state, seat, (x) => ({ ...x, apprenticeAbility: character }));
  return logNow(
    markResolved(next, `apprentice:${seat}`),
    `${nameAt(state, seat)} (Apprentice) gains the ${CHARACTERS[character].name}'s ability.`,
  );
}

/** The Lunatic (believing they are the Po) chose no one on an earlier night. */
export function lunaticPoChargeActive(state: CompanionState): boolean {
  const charged = state.lunaticPoChargedNight;
  if (charged === undefined) return false;
  return state.phase.kind !== "night" || state.phase.night > charged;
}

/**
 * How many players the Lunatic points at tonight — what the Demon they
 * believe they are would choose: two as the Shabaloth, one or (after a
 * "charge") three as the Po, one as the Zombuul or Pukka.
 */
export function lunaticAttacksWanted(state: CompanionState): number {
  const lunatic = state.players.find((p) => p.alive && p.character === "lunatic");
  if (lunatic?.believedCharacter === "shabaloth") return 2;
  if (lunatic?.believedCharacter === "po") return lunaticPoChargeActive(state) ? 3 : 1;
  return 1;
}

/**
 * What the Lunatic "did" tonight — shown to the real Demon at their step.
 * An empty pick is a "Po" choosing no one: they point at three next time.
 */
export function setLunaticChoices(state: CompanionState, seats: number[]): CompanionState {
  const lunatic = state.players.find((p) => p.alive && p.character === "lunatic");
  let next: CompanionState = { ...state, lunaticChoices: seats };
  if (!lunatic) return next;
  const believed = CHARACTERS[lunatic.believedCharacter ?? "lunatic"].name;
  if (seats.length === 0) {
    if (lunatic.believedCharacter === "po" && state.phase.kind === "night") {
      next = { ...next, lunaticPoChargedNight: state.phase.night };
    }
    next = logNow(next, `${lunatic.name} (Lunatic, as the ${believed}) chose no one.`);
  } else {
    next = logNow(
      next,
      `${lunatic.name} (Lunatic, as the ${believed}) chose ${seats.map((s) => nameAt(state, s)).join(", ")} — nothing happens.`,
    );
  }
  return resolveWake(next, lunatic.seat);
}

// ── Storyteller kill reminders (BMR night steps that don't wake anyone) ──

/** The Gossip spoke true today — the Storyteller's chosen player dies. */
export function recordGossipKill(state: CompanionState, targetSeat: number): CompanionState {
  return markResolved(kill(state, targetSeat, "gossip"), "gossip-kill");
}

/** The Tinker's random death, at the Storyteller's whim. */
export function recordTinkerDeath(state: CompanionState, tinkerSeat: number): CompanionState {
  return markResolved(kill(state, tinkerSeat, "tinker"), `tinker:${tinkerSeat}`);
}

/** The Moonchild's curse resolves: the cursed player dies (if good), or nothing happens. */
export function resolveMoonchildCurse(state: CompanionState, dies: boolean): CompanionState {
  const target = state.moonchildTarget;
  if (target === undefined) return state;
  let next = dies
    ? kill(state, target, "moonchild")
    : logNow(state, `The Moonchild's curse on ${nameAt(state, target)} does nothing.`);
  next = { ...next, moonchildTarget: undefined, moonchildCurseVoid: undefined };
  return markResolved(next, `moonchild-kill:${target}`);
}

/** The Demon killed the grandchild — the Grandmother dies of grief. */
export function recordGrandmotherDeath(
  state: CompanionState,
  grandmotherSeat: number,
): CompanionState {
  return markResolved(
    kill(state, grandmotherSeat, "grandmother"),
    `grandmother-dies:${grandmotherSeat}`,
  );
}

// ── Bad Moon Rising day actions ───────────────────────────────────────

/** The Gossip made a public statement today; record whether it was true. */
export function recordGossipStatement(state: CompanionState, wasTrue: boolean): CompanionState {
  const next: CompanionState = { ...state, gossipTrue: wasTrue ? true : undefined };
  return logNow(
    next,
    wasTrue
      ? "The Gossip's statement was TRUE — a player dies tonight."
      : "The Gossip's statement was false — no death from it tonight.",
  );
}

/** The dead Moonchild publicly curses an alive player. */
export function recordMoonchildChoice(state: CompanionState, targetSeat: number): CompanionState {
  const moonchild =
    state.moonchildPending !== undefined ? playerAt(state, state.moonchildPending) : undefined;
  const next: CompanionState = {
    ...state,
    moonchildPending: undefined,
    moonchildTarget: targetSeat,
    moonchildCurseVoid: moonchild && abilityVoid(state, moonchild) ? true : undefined,
  };
  return logNow(
    next,
    `The Moonchild curses ${nameAt(state, targetSeat)} — if good, they die tonight.`,
  );
}

/** The Mastermind's gambit: the Demon is dead, but one more day is played. */
export function beginMastermindDay(state: CompanionState): CompanionState {
  const next: CompanionState = { ...state, mastermindExtraDay: true };
  return logNow(
    next,
    "The Mastermind's gambit: the Demon is dead, but the game secretly continues for ONE more day. The next execution decides everything.",
  );
}

/**
 * The Judge forces the current execution to pass or fail (once per game).
 * On a fail the nominee counts as having received zero votes, so today's
 * about-to-die and vote-to-beat are recomputed without them.
 */
export function recordJudgeRuling(
  state: CompanionState,
  judgeSeat: number,
  nomineeSeat: number,
  passes: boolean,
): CompanionState {
  let next = markAbilityUsed(state, judgeSeat);
  next = logNow(
    next,
    `The Judge rules: ${nameAt(state, nomineeSeat)}'s execution ${passes ? "SUCCEEDS" : "fails"}.`,
  );
  if (passes) return settleExecution(state, kill(next, nomineeSeat, "execution"), nomineeSeat);
  const kept = next.day.nominations.filter((n) => n.nominee !== nomineeSeat);
  const highest = Math.max(0, ...kept.filter((n) => n.votes >= n.required).map((n) => n.votes));
  return {
    ...next,
    day: {
      ...next.day,
      highestVotes: highest,
      aboutToDie: next.day.aboutToDie?.seat === nomineeSeat ? undefined : next.day.aboutToDie,
    },
  };
}

/**
 * Re-seat the whole circle. `order[i]` is the CURRENT seat number of the
 * player who will sit at index `i` afterwards — a permutation of every seat.
 * Players keep their identity and their own state; seat numbers follow the
 * chairs, and every stored seat reference (grandchild, Butler's master, the
 * night's progress, today's nominations…) is remapped, so neighbour-based
 * abilities follow the physical table.
 */
export function reorderSeats(state: CompanionState, order: readonly number[]): CompanionState {
  const seats = state.players.map((p) => p.seat);
  if (order.length !== seats.length || new Set(order).size !== seats.length) {
    throw new Error("reorderSeats needs a permutation of every seat");
  }
  if (order.every((seat, i) => seat === seats[i])) return state;
  const byOld = new Map(state.players.map((p) => [p.seat, p] as const));
  const newIndex = new Map(order.map((seat, i) => [seat, i] as const));
  const remap = (s: number | undefined) => (s === undefined ? undefined : newIndex.get(s));
  const at = (s: number) => remap(s) as number;
  const remapAll = (xs: number[]) => xs.map(at);
  const remapId = (id: NightStepId): NightStepId => {
    const [kind, seat] = id.split(":");
    return seat === undefined ? id : `${kind}:${at(Number(seat))}`;
  };
  const players = order.map((oldSeat, i) => {
    const p = byOld.get(oldSeat);
    if (!p) throw new Error(`no player in seat ${oldSeat}`);
    return {
      ...p,
      seat: i,
      grandchild: remap(p.grandchild),
      butlerMaster: remap(p.butlerMaster),
      lastChoice: remap(p.lastChoice),
    };
  });
  return {
    ...state,
    players,
    nightProgress: {
      cursor: state.nightProgress.cursor && remapId(state.nightProgress.cursor),
      resolved: state.nightProgress.resolved.map(remapId),
      demonChoices: remapAll(state.nightProgress.demonChoices),
    },
    lastNight: state.lastNight
      ? { ...state.lastNight, died: remapAll(state.lastNight.died) }
      : undefined,
    pukkaVictim: remap(state.pukkaVictim),
    moonchildPending: remap(state.moonchildPending),
    moonchildTarget: remap(state.moonchildTarget),
    pendingImpInfo: remap(state.pendingImpInfo),
    shabalothVictims: state.shabalothVictims ? remapAll(state.shabalothVictims) : undefined,
    lunaticChoices: state.lunaticChoices ? remapAll(state.lunaticChoices) : undefined,
    lastExecution: state.lastExecution
      ? { ...state.lastExecution, seat: at(state.lastExecution.seat) }
      : undefined,
    day: {
      ...state.day,
      nominatorsUsed: remapAll(state.day.nominatorsUsed),
      nomineesUsed: remapAll(state.day.nomineesUsed),
      nominations: state.day.nominations.map((n) => ({
        ...n,
        nominator: at(n.nominator),
        nominee: at(n.nominee),
        ...(n.voters ? { voters: remapAll(n.voters) } : {}),
      })),
      aboutToDie: state.day.aboutToDie
        ? { ...state.day.aboutToDie, seat: at(state.day.aboutToDie.seat) }
        : undefined,
      executed: remap(state.day.executed),
    },
  };
}

/**
 * The Matron swaps two players' chairs (or the Storyteller fixes a
 * mis-entered seating order).
 */
export function swapSeats(state: CompanionState, a: number, b: number): CompanionState {
  if (a === b) return state;
  const seats = state.players.map((p) => p.seat);
  if (!seats.includes(a) || !seats.includes(b)) return state;
  const order = seats.map((s) => (s === a ? b : s === b ? a : s));
  const next = reorderSeats(state, order);
  return logNow(next, `${nameAt(state, a)} and ${nameAt(state, b)} swap seats.`);
}

/**
 * Move one player to the chair right after `afterSeat` (clockwise), or to
 * the first chair when `afterSeat` is null. Everyone else shuffles round.
 */
export function moveSeat(
  state: CompanionState,
  seat: number,
  afterSeat: number | null,
): CompanionState {
  const order = orderMoving(state, seat, afterSeat);
  if (!order) return state;
  const next = reorderSeats(state, order);
  const at = order.indexOf(seat);
  const n = order.length;
  return logNow(
    next,
    `${nameAt(state, seat)} moves to sit between ${nameAt(state, order[(at - 1 + n) % n])} and ${nameAt(
      state,
      order[(at + 1) % n],
    )}.`,
  );
}

/** The seat order with `seat` moved right after `afterSeat`; undefined when that is a no-op. */
function orderMoving(
  state: CompanionState,
  seat: number,
  afterSeat: number | null,
): number[] | undefined {
  if (seat === afterSeat) return undefined;
  const rest = state.players.map((p) => p.seat).filter((s) => s !== seat);
  const at = afterSeat === null ? 0 : rest.indexOf(afterSeat) + 1;
  if (afterSeat !== null && at === 0) return undefined;
  const order = [...rest.slice(0, at), seat, ...rest.slice(at)];
  return order.every((s, i) => s === state.players[i].seat) ? undefined : order;
}

// ── Day phase: nominations & voting ───────────────────────────────────

/** An alive Voudon hands the vote to the dead: no 50% floor, plurality rules. */
export function voudonActive(state: CompanionState): boolean {
  return state.players.some((p) => p.alive && !p.left && p.character === "voudon");
}

export function votesRequired(state: CompanionState): number {
  if (voudonActive(state)) return 1;
  return Math.ceil(aliveCount(state) / 2);
}

export function canNominate(state: CompanionState, seat: number): boolean {
  const p = playerAt(state, seat);
  return p.alive && !state.day.nominatorsUsed.includes(seat);
}

export function canBeNominated(state: CompanionState, seat: number): boolean {
  return !state.day.nomineesUsed.includes(seat);
}

/**
 * Resolve a completed vote tally. The threshold is half the alive players
 * (rounded up); a later nominee must EXCEED the current best to go up for
 * execution; matching it exactly ties, and nobody is about to die.
 */
export function recordNomination(
  state: CompanionState,
  nominator: number,
  nominee: number,
  votes: number,
): CompanionState {
  const required = votesRequired(state);
  const best = state.day.highestVotes;
  const result: VoteResult =
    votes < required
      ? "failed"
      : votes > best
        ? "about-to-die"
        : votes === best
          ? "tied"
          : "failed";

  const nomination: Nomination = { nominator, nominee, votes, required, result };
  let next: CompanionState = {
    ...state,
    day: {
      ...state.day,
      nominatorsUsed: [...state.day.nominatorsUsed, nominator],
      nomineesUsed: [...state.day.nomineesUsed, nominee],
      nominations: [...state.day.nominations, nomination],
      highestVotes: Math.max(best, votes >= required ? votes : 0),
      aboutToDie:
        result === "about-to-die"
          ? { seat: nominee, votes }
          : result === "tied"
            ? undefined
            : state.day.aboutToDie,
    },
  };
  const names = `${nameAt(state, nominator)} nominated ${nameAt(state, nominee)}`;
  const tally = `${votes}/${required} votes`;
  next = logNow(
    next,
    result === "about-to-die"
      ? `${names} — ${tally}: about to die.`
      : result === "tied"
        ? `${names} — ${tally}: tied with the previous nominee, no one is about to die.`
        : `${names} — ${tally}: not enough.`,
  );
  return next;
}

/**
 * The Virgin's first nomination. Either way the Virgin's ability is spent.
 * When `triggers` (nominator really is a sober Townsfolk and the Virgin is
 * sober), the nominator is executed immediately — that is the day's one
 * execution, and both nomination slots are consumed with no vote. When it
 * does NOT trigger, only the ability is spent: the nomination proceeds to a
 * normal vote, which `recordNomination` will book as usual.
 */
export function recordVirginTrigger(
  state: CompanionState,
  nominator: number,
  virginSeat: number,
  triggers: boolean,
): CompanionState {
  let next = markAbilityUsed(state, virginSeat);
  next = logNow(
    next,
    `${nameAt(state, nominator)} nominated ${nameAt(state, virginSeat)} — the Virgin's first nomination.`,
  );
  if (!triggers) return next;
  next = {
    ...next,
    day: {
      ...next.day,
      nominatorsUsed: [...next.day.nominatorsUsed, nominator],
      nomineesUsed: [...next.day.nomineesUsed, virginSeat],
    },
  };
  return settleExecution(state, kill(next, nominator, "virgin"), nominator);
}

/**
 * A public Slayer shot. `dies` is the Storyteller's call (true when the
 * target really is the Demon — or a Recluse the ST lets register as one).
 * A real Slayer spends their once-per-game ability even if drunk/poisoned;
 * a bluffing shooter spends nothing.
 */
export function recordSlayerShot(
  state: CompanionState,
  shooter: number,
  target: number,
  dies: boolean,
): CompanionState {
  let next = state;
  const realSlayer = playerAt(state, shooter).character === "slayer";
  if (realSlayer) next = markAbilityUsed(next, shooter);
  next = logNow(
    next,
    `${nameAt(state, shooter)} publicly shot ${nameAt(state, target)} with the Slayer ability.`,
  );
  if (dies) next = kill(next, target, "slayer");
  else next = logNow(next, "Nothing happened.");
  return next;
}

/**
 * What follows from WHO was executed today, whether or not they died of it:
 * a sober Saint dying by execution loses the game for good (TB), and on the
 * Mastermind's final day the executed player's team loses. `before` is the
 * state the execution was booked from (poison is cleared by death, so the
 * Saint's sobriety is read there).
 */
function settleExecution(
  before: CompanionState,
  after: CompanionState,
  executedSeat: number,
): CompanionState {
  if (after.phase.kind === "ended") return after;
  if (saintExecuted(before, executedSeat) && !playerAt(after, executedSeat).alive) {
    return endGame(after, "evil", "the Saint was executed");
  }
  if (before.mastermindExtraDay) {
    const winner = mastermindVerdict(before, executedSeat);
    return endGame(
      after,
      winner,
      winner === "good"
        ? "an evil player was executed on the Mastermind's final day"
        : "a good player was executed on the Mastermind's final day",
    );
  }
  return after;
}

/** Execute whoever is currently about to die (and settle what hangs on it). */
export function executeAboutToDie(state: CompanionState): CompanionState {
  const target = state.day.aboutToDie;
  if (!target) return state;
  return settleExecution(state, kill(state, target.seat, "execution"), target.seat);
}

/**
 * The Pacifist's mercy: the player about to die is executed but lives. Still
 * today's one execution — and on the Mastermind's day their team still
 * answers for it.
 */
export function spareByPacifist(state: CompanionState, seat: number): CompanionState {
  return settleExecution(state, survivedExecution(state, seat, "the Pacifist spares them"), seat);
}

/**
 * End the day and head into night. On the Mastermind's final day a day
 * WITHOUT an execution means good wins — the Demon was already dead.
 */
export function endDay(state: CompanionState): CompanionState {
  if (state.phase.kind !== "day") return state;
  const executed = state.day.executed !== undefined;
  if (!executed && state.mastermindExtraDay) {
    return endGame(state, "good", "no one was executed on the Mastermind's final day");
  }
  let next = state;
  if (!executed) next = logNow(next, "The day ends without an execution.");
  return beginNight(next);
}

// ── Storyteller info (the true answers) ───────────────────────────────

/** Seats that register evil by character type. Spy/Recluse caveats are the UI's job. */
export function evilSeats(state: CompanionState): number[] {
  return state.players.filter(isEvilPlayer).map((p) => p.seat);
}

/** Chef: pairs of neighbouring evil players around the full circle. */
export function chefNumber(state: CompanionState): number {
  const n = state.players.length;
  let pairs = 0;
  for (let i = 0; i < n; i++) {
    if (isEvilPlayer(state.players[i]) && isEvilPlayer(state.players[(i + 1) % n])) pairs++;
  }
  return pairs;
}

/** The two nearest ALIVE neighbours of a seat (clockwise and counter-clockwise). */
export function aliveNeighbours(state: CompanionState, seat: number): number[] {
  const n = state.players.length;
  const step = (from: number, dir: 1 | -1): number | undefined => {
    for (let d = 1; d < n; d++) {
      const p = state.players[(from + dir * d + n * d) % n];
      if (p.alive && p.seat !== seat) return p.seat;
    }
    return undefined;
  };
  const cw = step(seat, 1);
  const ccw = step(seat, -1);
  const out: number[] = [];
  if (cw !== undefined) out.push(cw);
  if (ccw !== undefined && ccw !== cw) out.push(ccw);
  return out;
}

/** Empath: how many of the seat's two alive neighbours are evil. */
export function empathNumber(state: CompanionState, seat: number): number {
  return aliveNeighbours(state, seat).filter((s) => isEvilPlayer(playerAt(state, s))).length;
}

/** Fortune Teller: does either chosen player ping (Demon or red herring)? */
export function fortuneTellerPing(state: CompanionState, a: number, b: number): boolean {
  return [a, b].some((s) => {
    const p = playerAt(state, s);
    return CHARACTERS[p.character].type === "demon" || p.redHerring;
  });
}

/**
 * First-night info suggestion for Washerwoman / Librarian / Investigator:
 * a real player of the wanted type, a decoy, and the character to name.
 * Returns undefined when no player of that type is in play (the Librarian's
 * "show 0" case).
 */
export function firstNightPairSuggestion(
  state: CompanionState,
  learnerSeat: number,
  type: "townsfolk" | "outsider" | "minion",
  rng: () => number = Math.random,
): { realSeat: number; decoySeat: number; character: CharacterId } | undefined {
  const candidates = state.players.filter(
    (p) => p.seat !== learnerSeat && CHARACTERS[p.character].type === type,
  );
  if (candidates.length === 0) return undefined;
  const real = candidates[Math.floor(rng() * candidates.length)];
  // The decoy can be anyone except the real pick — and never the learner
  // themself, who would trivially deduce the other player.
  const decoys = state.players.filter((p) => p.seat !== real.seat && p.seat !== learnerSeat);
  const decoy = decoys[Math.floor(rng() * decoys.length)];
  return { realSeat: real.seat, decoySeat: decoy.seat, character: real.character };
}

/** Undertaker: the character of the player executed yesterday. */
export function undertakerInfo(state: CompanionState): CharacterId | undefined {
  return state.lastExecution?.character;
}

// ── Win-condition prompts ─────────────────────────────────────────────

export type WinPrompt =
  | { kind: "good-wins"; reason: string }
  | { kind: "evil-wins"; reason: string }
  | { kind: "scarlet-woman"; seat: number }
  | { kind: "mastermind"; seat: number };

/**
 * Checks the Storyteller should be prompted about after a death. Never
 * auto-applied: the Scarlet Woman takeover, the Mastermind's extra day and
 * edge cases stay ST calls.
 */
export function winPrompts(state: CompanionState): WinPrompt[] {
  if (state.phase.kind === "ended") return [];
  // During the Mastermind's extra day the game is decided by the coming
  // execution (or its absence) — no other prompt applies.
  if (state.mastermindExtraDay) return [];
  const prompts: WinPrompt[] = [];
  if (!demonAlive(state)) {
    const scarletWoman = state.players.find((p) => p.alive && p.character === "scarlet-woman");
    // "5 or more players alive (Travellers don't count)" is measured JUST
    // BEFORE the Demon dies — i.e. 4+ residents left after the death. A
    // poisoned Scarlet Woman has no ability and cannot take over.
    if (scarletWoman && !scarletWoman.poisoned && aliveResidents(state) >= 4) {
      prompts.push({ kind: "scarlet-woman", seat: scarletWoman.seat });
    } else {
      // Mastermind: only if the Demon died by EXECUTION (which would have
      // ended the game) and a sober Mastermind lives.
      const executed = state.day.executed;
      const demonExecuted =
        executed !== undefined && CHARACTERS[playerAt(state, executed).character].type === "demon";
      const mastermind = state.players.find((p) => p.alive && p.character === "mastermind");
      if (demonExecuted && mastermind && !abilityVoid(state, mastermind)) {
        prompts.push({ kind: "mastermind", seat: mastermind.seat });
      } else {
        prompts.push({ kind: "good-wins", reason: "the Demon is dead" });
      }
    }
  } else {
    const hiddenZombuul = state.players.some((p) => p.registersDead && p.character === "zombuul");
    if (hiddenZombuul) {
      // A hidden Zombuul suspends the two-alive rule: the town can still
      // execute the dead. Prompt only when it is truly over.
      if (aliveResidents(state) <= 1) {
        prompts.push({ kind: "evil-wins", reason: "the hidden Zombuul has outlasted the town" });
      }
    } else if (aliveResidents(state) <= 2) {
      // Travellers don't count toward evil's two-players-left win.
      prompts.push({ kind: "evil-wins", reason: "only two players live" });
    }
  }
  return prompts;
}

/**
 * Mastermind-day verdict for an execution: the executed player's team loses,
 * whether or not they actually died from it.
 */
export function mastermindVerdict(state: CompanionState, executedSeat: number): Alignment {
  return isEvilPlayer(playerAt(state, executedSeat)) ? "good" : "evil";
}

/** The Saint execution check: true when executing this seat should lose the game for good. */
export function saintExecuted(state: CompanionState, seat: number): boolean {
  const p = playerAt(state, seat);
  return p.character === "saint" && !p.poisoned;
}
