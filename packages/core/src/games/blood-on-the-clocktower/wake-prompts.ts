// What a woken player is asked, as data.
//
// At the table a woken player points; online their device asks them. Every
// character with a night action has an entry here (`wake-prompts.test.ts`
// checks the sheet), and the counts that depend on the night — the Po after a
// charge, the Lunatic copying their believed Demon — come from the same
// selectors the Storyteller's wizard uses. A player's answer is a REQUEST:
// the Storyteller sees it and resolves the step; nothing here changes state.

import { CHARACTERS, type CharacterId } from "./characters.ts";
import {
  demonAttacksWanted,
  demonPlayer,
  lunaticAttacksWanted,
  type NightStep,
  playerAt,
} from "./companion.ts";
import type { CompanionPlayer, CompanionState } from "./schema.ts";

/**
 * Alive as far as the town knows: a death in the night is news only at dawn
 * (until then the victim still looks alive), and a Zombuul's fake death looks
 * like any other. Anything shown or checked for a player uses this, never
 * `alive` — a refusal like "choose a living player" would leak a night kill.
 */
export function publiclyAlive(state: CompanionState, p: CompanionPlayer): boolean {
  return p.alive || (state.phase.kind === "night" && p.diedTonight);
}

/** Which players a pick may land on. */
export type PickFilter = "any" | "alive" | "dead";

export type WakePrompt =
  /** Nothing to choose: they open their eyes, learn something, sleep. */
  | { kind: "info" }
  /** Point at players: between `min` and `max` of them. */
  | {
      kind: "players";
      min: number;
      max: number;
      filter: PickFilter;
      allowSelf: boolean;
      /** Chairs they may not pick tonight (the Exorcist's, the Devil's Advocate's last choice). */
      excluded: number[];
    }
  /** Point at a character on the sheet — or shake their head (`optional`). */
  | { kind: "character"; optional: boolean }
  /** A player, then a character on the sheet (the Gambler). */
  | { kind: "player-and-character" };

/** The player's answer, in chairs (the online layer converts from room seats). */
export interface WakeChoice {
  readonly seats: readonly number[];
  readonly character?: CharacterId;
}

const players = (
  min: number,
  max: number,
  opts: { filter?: PickFilter; allowSelf?: boolean; excluded?: number[] } = {},
): WakePrompt => ({
  kind: "players",
  min,
  max,
  filter: opts.filter ?? "any",
  allowSelf: opts.allowSelf ?? true,
  excluded: opts.excluded ?? [],
});

const INFO: WakePrompt = { kind: "info" };

/**
 * The prompt for a character woken for their own ability. `seat` is their
 * chair; the state supplies the night-dependent counts. Characters that only
 * learn something get `info`.
 */
export function promptForCharacter(
  state: CompanionState,
  character: CharacterId,
  seat: number,
): WakePrompt {
  const me = playerAt(state, seat);
  const lastChoice = me.lastChoice !== undefined ? [me.lastChoice] : [];
  switch (character) {
    // ── Trouble Brewing ────────────────────────────────────────────────
    case "fortune-teller":
      return players(2, 2);
    case "monk":
      return players(1, 1, { allowSelf: false });
    case "butler":
      return players(1, 1, { allowSelf: false });
    case "poisoner":
      return players(1, 1);
    case "ravenkeeper":
      return players(1, 1);
    case "imp":
      return players(1, 1);
    case "bureaucrat":
    case "thief":
      return players(1, 1, { allowSelf: false });
    // ── Bad Moon Rising ────────────────────────────────────────────────
    case "sailor":
      return players(1, 1, { filter: "alive", allowSelf: false });
    case "chambermaid":
      return players(2, 2, { filter: "alive", allowSelf: false });
    case "exorcist":
      return players(1, 1, { allowSelf: false, excluded: lastChoice });
    case "innkeeper":
      return players(2, 2);
    case "gambler":
      return { kind: "player-and-character" };
    case "courtier":
      return { kind: "character", optional: true };
    case "professor":
      return players(0, 1, { filter: "dead", allowSelf: false });
    case "godfather":
      // First night they only learn the Outsiders; later they kill.
      return state.phase.kind === "night" && state.phase.night === 1 ? INFO : players(1, 1);
    case "devils-advocate":
      return players(1, 1, { filter: "alive", excluded: lastChoice });
    case "assassin":
      return me.usedAbility ? INFO : players(0, 1);
    case "zombuul":
      return players(1, 1);
    case "pukka":
      return players(1, 1);
    case "shabaloth":
      return players(2, 2);
    case "po": {
      const wanted = demonAttacksWanted(state);
      return players(0, Math.max(1, wanted));
    }
    default:
      return INFO;
  }
}

/** What the player woken by `step` is asked (the Lunatic acts as their believed Demon). */
export function wakePrompt(state: CompanionState, step: NightStep): WakePrompt {
  if (step.kind !== "wake") return INFO;
  const p = playerAt(state, step.seat);
  if (p.character === "lunatic") {
    const wanted = lunaticAttacksWanted(state);
    return players(step.character === "po" ? 0 : wanted, Math.max(1, wanted));
  }
  return promptForCharacter(state, step.character, step.seat);
}

/**
 * The chairs a step wakes: the woken player for a wake step, every Minion for
 * the Minion info, the Demon for the Demon info. Steps the Storyteller
 * settles alone (a Tinker's death, dawn…) wake nobody.
 */
export function wakersOf(state: CompanionState, step: NightStep): number[] {
  switch (step.kind) {
    case "wake":
    case "you-are-imp":
    case "lunatic-info":
    case "apprentice":
      return [step.seat];
    case "minion-info":
      return state.players
        .filter((p) => !p.left && CHARACTERS[p.character].type === "minion")
        .map((p) => p.seat);
    case "demon-info": {
      const demon = demonPlayer(state);
      return demon ? [demon.seat] : [];
    }
    default:
      return [];
  }
}

/** Why `choice` doesn't answer `prompt` for the player in `seat`, or `null` when it does. */
export function choiceProblem(
  state: CompanionState,
  seat: number,
  prompt: WakePrompt,
  choice: WakeChoice,
): string | null {
  const seats = choice.seats;
  if (new Set(seats).size !== seats.length) return "pick each player once";
  for (const s of seats) {
    if (!Number.isInteger(s) || s < 0 || s >= state.players.length) return "no such player";
    if (state.players[s]?.left) return "that player has left";
  }
  switch (prompt.kind) {
    case "info":
      return seats.length === 0 && choice.character === undefined ? null : "nothing to choose";
    case "character":
      if (seats.length > 0) return "choose a character, not a player";
      if (choice.character === undefined) return prompt.optional ? null : "choose a character";
      return null;
    case "player-and-character":
      if (seats.length !== 1) return "choose one player";
      if (choice.character === undefined) return "choose a character";
      return null;
    case "players": {
      if (choice.character !== undefined) return "choose players, not a character";
      if (seats.length < prompt.min || seats.length > prompt.max) {
        return prompt.min === prompt.max
          ? `choose ${prompt.min} player${prompt.min === 1 ? "" : "s"}`
          : `choose ${prompt.min}–${prompt.max} players`;
      }
      for (const s of seats) {
        const p = state.players[s];
        if (!p) return "no such player";
        if (!prompt.allowSelf && s === seat) return "you can't choose yourself";
        if (prompt.excluded.includes(s)) return "you chose that player last night";
        const alive = publiclyAlive(state, p);
        if (prompt.filter === "alive" && !alive) return "choose a living player";
        if (prompt.filter === "dead" && alive) return "choose a dead player";
      }
      return null;
    }
  }
}
