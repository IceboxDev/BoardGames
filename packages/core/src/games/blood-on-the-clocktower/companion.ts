// Storyteller companion state for Trouble Brewing.
//
// This is the app-side Grimoire: it tracks each seat's character and states
// (alive/dead, poisoned, protected, ghost vote…), generates the night-sheet
// queue with the boxed sheet's skip rules, computes the true information each
// info character should be given (Chef pairs, Empath neighbours, Fortune
// Teller readings…), and referees day-phase vote math.
//
// Design rule: THE STORYTELLER IS THE BOSS (rulebook, page 5). The reducer
// never hard-blocks or auto-ends the game — selectors surface prompts and the
// UI asks the Storyteller to confirm. Everything is pure and serializable so
// the web client can persist state to localStorage as-is.

import type { CharacterId } from "./characters.ts";
import { CHARACTERS, FIRST_NIGHT_ORDER, isEvil, OTHER_NIGHTS_ORDER } from "./characters.ts";
import type { GameSetup } from "./setup.ts";

export type Alignment = "good" | "evil";

export type DeathCause = "execution" | "demon" | "slayer" | "virgin" | "storyteller";

export type CompanionPlayer = {
  seat: number;
  name: string;
  character: CharacterId;
  /** Drunk only: the Townsfolk this player believes they are. */
  believedCharacter?: CharacterId;
  alive: boolean;
  /** Dead players keep one ghost vote for the rest of the game. */
  ghostVote: boolean;
  /** Poisoner target — lasts tonight and tomorrow day (cleared at next dusk). */
  poisoned: boolean;
  /** Monk target — safe from the Demon tonight (cleared at dawn). */
  protectedTonight: boolean;
  /** Registers as a Demon to the Fortune Teller. */
  redHerring: boolean;
  /** Butler only: the master they may only vote alongside. */
  butlerMaster?: number;
  /** Slayer shot / Virgin trigger spent. */
  usedAbility: boolean;
  /** Died during the current night; announced and cleared at dawn. */
  diedTonight: boolean;
  note?: string;
};

export type Phase =
  | { kind: "reveal" }
  | { kind: "night"; night: number }
  | { kind: "day"; day: number }
  | { kind: "ended"; winner: Alignment; reason: string };

export type VoteResult = "about-to-die" | "failed" | "tied";

export type Nomination = {
  nominator: number;
  nominee: number;
  votes: number;
  required: number;
  result: VoteResult;
};

export type DayState = {
  nominatorsUsed: number[];
  nomineesUsed: number[];
  nominations: Nomination[];
  aboutToDie?: { seat: number; votes: number };
  /**
   * Highest successful tally today. Survives a tie (which clears
   * `aboutToDie`): a later nominee still has to EXCEED the tied number.
   */
  highestVotes: number;
  executed?: number;
};

export type LogEntry = { id: number; when: string; text: string };

export type CompanionState = {
  version: 1;
  script: "trouble-brewing";
  players: CompanionPlayer[];
  demonBluffs: CharacterId[];
  phase: Phase;
  /** Cursor into nightQueue() for the current night. */
  nightStep: number;
  day: DayState;
  /** Most recent execution — feeds the Undertaker the following night. */
  lastExecution?: { day: number; seat: number; character: CharacterId };
  /** Seat that became the Imp today (Scarlet Woman / star pass) — gets a "you are" step tonight. */
  pendingImpInfo?: number;
  /** The non-playing Storyteller running the game (match-history moderator). */
  storyteller?: string;
  /** Set once the finished game is ported to match history (blocks double-posts). */
  historyMatchId?: number;
  log: LogEntry[];
  nextLogId: number;
};

const EMPTY_DAY: DayState = {
  nominatorsUsed: [],
  nomineesUsed: [],
  nominations: [],
  highestVotes: 0,
};

// ── Construction ──────────────────────────────────────────────────────

export function createGame(setup: GameSetup, opts?: { storyteller?: string }): CompanionState {
  const players: CompanionPlayer[] = setup.seats.map((s) => ({
    seat: s.seat,
    name: s.name,
    character: s.character,
    ...(s.believedCharacter ? { believedCharacter: s.believedCharacter } : {}),
    alive: true,
    ghostVote: true,
    poisoned: false,
    protectedTonight: false,
    redHerring: s.seat === setup.redHerringSeat,
    usedAbility: false,
    diedTonight: false,
  }));
  const state: CompanionState = {
    version: 1,
    script: "trouble-brewing",
    players,
    demonBluffs: setup.demonBluffs,
    phase: { kind: "reveal" },
    nightStep: 0,
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

export function isEvilPlayer(p: CompanionPlayer): boolean {
  return isEvil(CHARACTERS[p.character].type);
}

export function aliveCount(state: CompanionState): number {
  return state.players.filter((p) => p.alive).length;
}

export function demonAlive(state: CompanionState): boolean {
  return state.players.some((p) => p.alive && CHARACTERS[p.character].type === "demon");
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
      character: CharacterId;
      seat: number;
      /** Waking player is secretly the Drunk — their ability is void. */
      isDrunk: boolean;
      /** Waking player is poisoned — their ability is void. */
      poisoned: boolean;
    }
  | { kind: "dawn" };

function wakeStep(p: CompanionPlayer): NightStep {
  return {
    kind: "wake",
    character: apparentCharacter(p),
    seat: p.seat,
    isDrunk: p.believedCharacter !== undefined,
    poisoned: p.poisoned,
  };
}

/**
 * The full step list for the current night, following the boxed Trouble
 * Brewing night sheet with its skip rules (dead players don't wake; the
 * Ravenkeeper wakes only on the night they die; the Undertaker only after an
 * execution day; Minion/Demon info only on the first night with 7+ players).
 * Recompute after every action — recording an Imp kill can add the
 * Ravenkeeper's step later in the same night.
 */
export function nightQueue(state: CompanionState): NightStep[] {
  if (state.phase.kind !== "night") return [];
  const night = state.phase.night;
  const steps: NightStep[] = [];
  const wakers = (id: CharacterId) =>
    state.players.filter((p) => p.alive && apparentCharacter(p) === id);

  if (night === 1) {
    if (state.players.length >= 7) {
      steps.push({ kind: "minion-info" }, { kind: "demon-info" });
    }
    for (const id of FIRST_NIGHT_ORDER) {
      for (const p of wakers(id)) steps.push(wakeStep(p));
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
          if (p.diedTonight && apparentCharacter(p) === "ravenkeeper") {
            steps.push(wakeStep(p));
          }
        }
        continue;
      }
      if (id === "undertaker") {
        // Only the night after an execution day.
        if (state.lastExecution?.day === night - 1) {
          for (const p of wakers("undertaker")) steps.push(wakeStep(p));
        }
        continue;
      }
      for (const p of wakers(id)) steps.push(wakeStep(p));
    }
  }
  steps.push({ kind: "dawn" });
  return steps;
}

// ── Phase transitions ─────────────────────────────────────────────────

export function beginNight(state: CompanionState): CompanionState {
  const night =
    state.phase.kind === "day" ? state.phase.day + 1 : state.phase.kind === "reveal" ? 1 : 0;
  if (night === 0) return state;
  // Poison from last night expires at dusk (it lasted "tonight and tomorrow
  // day"). The Poisoner will pick a fresh target in tonight's queue.
  let next: CompanionState = {
    ...state,
    players: state.players.map((p) => ({ ...p, poisoned: false })),
    phase: { kind: "night", night },
    nightStep: 0,
    day: EMPTY_DAY,
  };
  next = logNow(next, night === 1 ? "The first night begins." : "Night falls.");
  return next;
}

export function setNightStep(state: CompanionState, step: number): CompanionState {
  return { ...state, nightStep: Math.max(0, step) };
}

/** Dawn: announce deaths, clear night-scoped statuses, move to day. */
export function dawn(state: CompanionState): CompanionState {
  if (state.phase.kind !== "night") return state;
  const died = state.players.filter((p) => p.diedTonight);
  const day = state.phase.night;
  let next: CompanionState = {
    ...state,
    players: state.players.map((p) => ({ ...p, diedTonight: false, protectedTonight: false })),
    phase: { kind: "day", day },
    nightStep: 0,
    pendingImpInfo: undefined,
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
  storyteller: "died",
};

export function kill(state: CompanionState, seat: number, cause: DeathCause): CompanionState {
  const p = playerAt(state, seat);
  if (!p.alive) return state;
  const atNight = state.phase.kind === "night";
  let next = mapPlayer(state, seat, (x) => ({
    ...x,
    alive: false,
    diedTonight: atNight,
    poisoned: false,
    protectedTonight: false,
  }));
  next = logNow(next, `${p.name} ${CAUSE_LABEL[cause]}.`);
  if (cause === "execution" || cause === "virgin") {
    const day = state.phase.kind === "day" ? state.phase.day : 0;
    next = {
      ...next,
      lastExecution: { day, seat, character: p.character },
      day: { ...next.day, executed: seat },
    };
  }
  return next;
}

export function revive(state: CompanionState, seat: number): CompanionState {
  const p = playerAt(state, seat);
  if (p.alive) return state;
  let next = mapPlayer(state, seat, (x) => ({ ...x, alive: true, diedTonight: false }));
  next = logNow(next, `${p.name} returns to life.`);
  return next;
}

export function setPoison(state: CompanionState, seat: number | undefined): CompanionState {
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

export function markAbilityUsed(state: CompanionState, seat: number): CompanionState {
  return mapPlayer(state, seat, (x) => ({ ...x, usedAbility: true }));
}

export function setNote(state: CompanionState, seat: number, note: string): CompanionState {
  return mapPlayer(state, seat, (x) => ({ ...x, note: note || undefined }));
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
  next = logNow(
    next,
    `${p.name} becomes the ${CHARACTERS[character].name} (was the ${CHARACTERS[p.character].name}).`,
  );
  if (character === "imp") next = { ...next, pendingImpInfo: seat };
  return next;
}

/** Record the Imp's night choice, with the outcome the Storyteller resolved. */
export function recordDemonKill(
  state: CompanionState,
  target: number,
  outcome: "dies" | "safe",
  note?: string,
): CompanionState {
  const targetName = nameAt(state, target);
  if (outcome === "safe") {
    return logNow(state, `The Imp chose ${targetName} — no one died${note ? ` (${note})` : ""}.`);
  }
  let next = kill(state, target, "demon");
  if (note) next = logNow(next, note);
  return next;
}

// ── Day phase: nominations & voting ───────────────────────────────────

export function votesRequired(state: CompanionState): number {
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
  return kill(next, nominator, "virgin");
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

/** Execute whoever is currently about to die. */
export function executeAboutToDie(state: CompanionState): CompanionState {
  const target = state.day.aboutToDie;
  if (!target) return state;
  return kill(state, target.seat, "execution");
}

/** End the day without (or after) an execution and head into night. */
export function endDay(state: CompanionState): CompanionState {
  if (state.phase.kind !== "day") return state;
  const executed = state.day.executed !== undefined;
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
  const decoys = state.players.filter((p) => p.seat !== real.seat);
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
  | { kind: "scarlet-woman"; seat: number };

/**
 * Checks the Storyteller should be prompted about after a death. Never
 * auto-applied: the Scarlet Woman takeover and edge cases stay ST calls.
 */
export function winPrompts(state: CompanionState): WinPrompt[] {
  if (state.phase.kind === "ended") return [];
  const prompts: WinPrompt[] = [];
  if (!demonAlive(state)) {
    const scarletWoman = state.players.find((p) => p.alive && p.character === "scarlet-woman");
    if (scarletWoman && aliveCount(state) >= 5) {
      prompts.push({ kind: "scarlet-woman", seat: scarletWoman.seat });
    } else {
      prompts.push({ kind: "good-wins", reason: "the Demon is dead" });
    }
  }
  if (aliveCount(state) <= 2 && demonAlive(state)) {
    prompts.push({ kind: "evil-wins", reason: "only two players live" });
  }
  return prompts;
}

/** The Saint execution check: true when executing this seat should lose the game for good. */
export function saintExecuted(state: CompanionState, seat: number): boolean {
  const p = playerAt(state, seat);
  return p.character === "saint" && !p.poisoned;
}
