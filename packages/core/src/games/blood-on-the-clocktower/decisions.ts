// The Storyteller's adjudications, computed once here so the wizard renders
// VERDICTS instead of deriving rules in JSX. Every selector answers "what
// does the rulebook say happens if the Storyteller lets this through", as
// structured data the view turns into words; the Storyteller stays the boss
// and can always override from the Grimoire.

import type { CharacterId } from "./characters.ts";
import { CHARACTERS } from "./characters.ts";
import type { CompanionState, DeathCause, Protection } from "./companion.ts";
import {
  abilityVoid,
  aliveCount,
  aliveResidents,
  deathProtections,
  isEvilPlayer,
  playerAt,
} from "./companion.ts";

// ── Deaths ────────────────────────────────────────────────────────────

export type DeathOutcome = {
  /** Already dead (and not a hidden Zombuul): nothing happens. */
  alreadyDead: boolean;
  /** Rule-fixed shields the engine will honour — the player won't die. */
  protections: Protection[];
  /** A sober Zombuul's first death: they only APPEAR to die. */
  zombuulFakeDeath: boolean;
};

/** What `kill(state, seat, cause)` would do right now. */
export function deathOutcome(state: CompanionState, seat: number, cause: DeathCause): DeathOutcome {
  const p = playerAt(state, seat);
  const alreadyDead = !p.alive && !p.registersDead;
  const bypass = cause === "assassin" || cause === "storyteller";
  return {
    alreadyDead,
    protections: alreadyDead || bypass || !p.alive ? [] : deathProtections(state, p, cause),
    zombuulFakeDeath:
      !alreadyDead &&
      p.alive &&
      p.character === "zombuul" &&
      !p.registersDead &&
      !abilityVoid(state, p) &&
      (bypass || deathProtections(state, p, cause).length === 0),
  };
}

export type DemonAttackOutcome = DeathOutcome & {
  /** The Demon points at themself — the Imp's star pass. */
  self: boolean;
  /** A sober Mayor: the Storyteller MAY kill another player instead. */
  mayorRedirect: boolean;
  /** On a self-kill: alive Minions who may inherit the Imp, Scarlet Woman first. */
  starPassCandidates: number[];
};

/** What the Demon's attack on `target` would do, plus the Storyteller's options. */
export function demonAttackOutcome(state: CompanionState, target: number): DemonAttackOutcome {
  const p = playerAt(state, target);
  const death = deathOutcome(state, target, "demon");
  const demon = state.players.find(
    (x) => (x.alive || x.registersDead) && CHARACTERS[x.character].type === "demon",
  );
  const self = demon?.seat === target;
  const minions = state.players.filter(
    (x) => x.alive && !x.left && CHARACTERS[x.character].type === "minion",
  );
  return {
    ...death,
    self,
    mayorRedirect: !self && !death.alreadyDead && p.character === "mayor" && !abilityVoid(state, p),
    starPassCandidates: self
      ? [
          ...minions.filter((x) => x.character === "scarlet-woman"),
          ...minions.filter((x) => x.character !== "scarlet-woman"),
        ].map((x) => x.seat)
      : [],
  };
}

// ── Day-phase abilities ───────────────────────────────────────────────

export type VirginOutcome =
  | { kind: "executes" }
  /** The nominator is the Spy, who MAY register as a Townsfolk — the Storyteller's call. */
  | { kind: "spy-may-register" }
  | { kind: "nothing"; reason: "nominator-not-townsfolk" | "virgin-void" };

/**
 * The Virgin's first nomination, when `nominee` looks like the Virgin to the
 * town (a Drunk who believes they are the Virgin triggers the same ritual —
 * and nothing happens). Undefined when this is not that moment.
 */
export function virginNomination(
  state: CompanionState,
  nominator: number,
  nominee: number,
): VirginOutcome | undefined {
  const virgin = playerAt(state, nominee);
  if ((virgin.believedCharacter ?? virgin.character) !== "virgin") return undefined;
  if (!virgin.alive || virgin.usedAbility) return undefined;
  const real = virgin.character === "virgin" && !abilityVoid(state, virgin);
  if (!real) return { kind: "nothing", reason: "virgin-void" };
  const who = playerAt(state, nominator);
  if (CHARACTERS[who.character].type === "townsfolk") return { kind: "executes" };
  if (who.character === "spy") return { kind: "spy-may-register" };
  return { kind: "nothing", reason: "nominator-not-townsfolk" };
}

export type SlayerOutcome =
  | { kind: "dies" }
  /** The target is the Recluse, who MAY register as the Demon — the Storyteller's call. */
  | { kind: "recluse-may-register" }
  | { kind: "nothing"; reason: "not-demon" | "not-slayer" | "slayer-void" | "spent" };

/** A public Slayer shot: `shooter` claims the ability and points at `target`. */
export function slayerShot(state: CompanionState, shooter: number, target: number): SlayerOutcome {
  const who = playerAt(state, shooter);
  if (who.character !== "slayer") return { kind: "nothing", reason: "not-slayer" };
  if (who.usedAbility) return { kind: "nothing", reason: "spent" };
  if (abilityVoid(state, who)) return { kind: "nothing", reason: "slayer-void" };
  const t = playerAt(state, target);
  if (CHARACTERS[t.character].type === "demon") return { kind: "dies" };
  if (t.character === "recluse") return { kind: "recluse-may-register" };
  return { kind: "nothing", reason: "not-demon" };
}

export type ExecutionOutcome = {
  /** Trouble Brewing: executing this sober Saint loses the game for good. */
  saintLoss: boolean;
  /** Bad Moon Rising: executed but LIVES, for these reasons. */
  protections: Protection[];
  /** A sober Zombuul: announce a normal death, they secretly live. */
  zombuulFakeDeath: boolean;
  /** A sober Pacifist is in play and the nominee is good — the Storyteller MAY spare them. */
  pacifistSeat?: number;
  /** An alive Scapegoat of the nominee's alignment may be executed instead. */
  scapegoatSeat?: number;
  /** The Mastermind's final day: the executed player's TEAM decides the game. */
  mastermindDay: boolean;
};

/** Everything that hangs on executing the player about to die. */
export function executionOutcome(state: CompanionState, seat: number): ExecutionOutcome {
  const p = playerAt(state, seat);
  const death = deathOutcome(state, seat, "execution");
  const bmr = state.script === "bad-moon-rising";
  const pacifist = bmr
    ? state.players.find((x) => x.alive && x.character === "pacifist" && !abilityVoid(state, x))
    : undefined;
  const scapegoat = state.players.find(
    (x) => x.alive && x.character === "scapegoat" && isEvilPlayer(x) === isEvilPlayer(p),
  );
  return {
    saintLoss: !bmr && p.character === "saint" && !p.poisoned,
    protections: death.protections,
    zombuulFakeDeath: death.zombuulFakeDeath,
    pacifistSeat:
      pacifist && !isEvilPlayer(p) && death.protections.length === 0 ? pacifist.seat : undefined,
    scapegoatSeat: scapegoat?.seat,
    mastermindDay: Boolean(state.mastermindExtraDay),
  };
}

export type MayorWin =
  | { kind: "available" }
  /** Travellers count as players for the Mayor's three — exile them first. */
  | { kind: "blocked-by-travellers"; alive: number };

/** The Mayor's "only three live, no execution" win, if the day ended now. */
export function mayorWin(state: CompanionState): MayorWin | undefined {
  if (state.phase.kind !== "day" || state.day.executed !== undefined) return undefined;
  const mayor = state.players.find(
    (p) => p.alive && p.character === "mayor" && !abilityVoid(state, p),
  );
  if (!mayor) return undefined;
  const alive = aliveCount(state);
  if (alive === 3) return { kind: "available" };
  if (alive > 3 && aliveResidents(state) <= 3) return { kind: "blocked-by-travellers", alive };
  return undefined;
}

// ── Night abilities ───────────────────────────────────────────────────

export type GamblerOutcome = "correct" | "dies" | "void";

/** The Gambler points at `target` and names `guess`. */
export function gamblerOutcome(
  state: CompanionState,
  gamblerSeat: number,
  target: number,
  guess: CharacterId,
): GamblerOutcome {
  if (playerAt(state, target).character === guess) return "correct";
  return abilityVoid(state, playerAt(state, gamblerSeat)) ? "void" : "dies";
}

export type ProfessorOutcome = "resurrects" | "not-townsfolk" | "void";

/** The Professor's once-per-game pick of a dead player. */
export function professorOutcome(
  state: CompanionState,
  professorSeat: number,
  target: number,
): ProfessorOutcome {
  if (abilityVoid(state, playerAt(state, professorSeat))) return "void";
  return CHARACTERS[playerAt(state, target).character].type === "townsfolk"
    ? "resurrects"
    : "not-townsfolk";
}

/** The Exorcist's pick blocks the Demon tonight when it lands on the (functioning) Demon. */
export function exorcistBlocksDemon(
  state: CompanionState,
  exorcistSeat: number,
  target: number,
): boolean {
  const t = playerAt(state, target);
  return (
    CHARACTERS[t.character].type === "demon" &&
    (t.alive || Boolean(t.registersDead)) &&
    !abilityVoid(state, playerAt(state, exorcistSeat))
  );
}

export type MoonchildCurseOutcome = {
  target: number;
  /** The cursed player is good — they die (unless the curse was cast void). */
  good: boolean;
  /** The Moonchild was drunk or poisoned when they chose. */
  castVoid: boolean;
  dies: boolean;
};

/** The pending Moonchild curse, resolved at the Moonchild's sheet position. */
export function moonchildCurseOutcome(state: CompanionState): MoonchildCurseOutcome | undefined {
  const target = state.moonchildTarget;
  if (target === undefined) return undefined;
  const good = !isEvilPlayer(playerAt(state, target));
  const castVoid = Boolean(state.moonchildCurseVoid);
  return { target, good, castVoid, dies: good && !castVoid };
}
