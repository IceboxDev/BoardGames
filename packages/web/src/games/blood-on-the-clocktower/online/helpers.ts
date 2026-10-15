import {
  CHARACTERS,
  type CharacterId,
} from "@boardgames/core/games/blood-on-the-clocktower/characters";
import { type NightStep, nameAt } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import type { BotcView } from "@boardgames/core/games/blood-on-the-clocktower/online/view";
import {
  CharacterIdSchema,
  type CompanionState,
} from "@boardgames/core/games/blood-on-the-clocktower/schema";

/** A `<select>` value as a character id, or `null` for "none". */
export function asCharacter(value: string): CharacterId | null {
  const parsed = CharacterIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** "Fortune Teller — Ann", "Minion info", "Dawn": one night-sheet line. */
export function stepLabel(state: CompanionState, step: NightStep): string {
  switch (step.kind) {
    case "minion-info":
      return "Minion info";
    case "demon-info":
      return "Demon info";
    case "you-are-imp":
      return `New Imp — ${nameAt(state, step.seat)}`;
    case "wake":
      return `${CHARACTERS[step.character].name} — ${nameAt(state, step.seat)}`;
    case "lunatic-info":
      return `Lunatic's Demon info — ${nameAt(state, step.seat)}`;
    case "apprentice":
      return `Apprentice — ${nameAt(state, step.seat)}`;
    case "gossip-kill":
      return "The Gossip spoke true";
    case "tinker":
      return `Tinker — ${nameAt(state, step.seat)}`;
    case "moonchild-kill":
      return "The Moonchild's curse";
    case "grandmother-dies":
      return "The Grandmother's grief";
    case "pukka-victim":
      return "The Pukka's victim";
    case "dawn":
      return "Dawn";
  }
}

/** The chair of the person in `roomSeat`. */
export function chairOf(state: CompanionState, roomSeat: number): number | undefined {
  return state.players.find((p) => p.roomSeat === roomSeat)?.seat;
}

/** The person in `chair`. */
export function roomSeatOf(state: CompanionState, chair: number): number | undefined {
  return state.players[chair]?.roomSeat;
}

export function nameOf(view: BotcView, roomSeat: number): string {
  if (roomSeat === 0) return view.names[0] ? `${view.names[0]} (Storyteller)` : "Storyteller";
  return view.names[roomSeat] ?? `Player ${roomSeat}`;
}

/** "Night 2", "Day 3", "Setup", "Game over". */
export function phaseTitle(view: BotcView): string {
  switch (view.phase.kind) {
    case "setup":
      return "Setting up";
    case "reveal":
      return "Characters dealt";
    case "night":
      return `Night ${view.phase.number}`;
    case "day":
      return `Day ${view.phase.number}`;
    case "ended":
      return view.phase.winner === "good" ? "Good wins" : "Evil wins";
  }
}

/** Where the clock hand points in the town square: the next voter not yet passed. */
export function clockChair(view: BotcView): number | null {
  const vote = view.day.vote;
  if (!vote || vote.status === "open" || vote.status === "done") return null;
  const next = vote.order[vote.locked];
  if (next === undefined) return null;
  const at = view.town.findIndex((t) => t.seat === next);
  return at === -1 ? null : at;
}

/** The hand of `roomSeat` in the current vote, for the token. */
export function handOf(view: BotcView, roomSeat: number): { up: boolean; locked: boolean } | null {
  const vote = view.day.vote;
  if (!vote) return null;
  const i = vote.order.indexOf(roomSeat);
  if (i === -1) return null;
  return { up: vote.hands[i] ?? false, locked: i < vote.locked };
}
