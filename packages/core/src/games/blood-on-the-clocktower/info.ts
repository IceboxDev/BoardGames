// What the Storyteller tells a woken player, as data.
//
// At the table it is fingers, a nod or a token held up; online it is an
// `InfoPayload` delivered to one player's device. `suggestedInfo` pre-fills
// the TRUE answer for the Storyteller from the same selectors the phone
// wizard shows (`chefNumber`, `empathNumber`, `fortuneTellerPing`, …) and
// says when the player's ability is void, so a poisoned Empath can be told
// a wrong number on purpose. The Storyteller always has the last word: the
// suggestion is only what's in the composer when it opens.
//
// Seats in a payload are whatever `seatId` maps a chair to — the online game
// passes the room seat, which is stable while chairs move.

import { z } from "zod";
import { CHARACTERS, type CharacterId } from "./characters.ts";
import {
  abilityVoid,
  apparentCharacter,
  chambermaidNumber,
  chefNumber,
  demonPlayer,
  empathNumber,
  firstNightPairSuggestion,
  fortuneTellerPing,
  type NightStep,
  playerAt,
  undertakerInfo,
} from "./companion.ts";
import { AlignmentSchema, CharacterIdSchema, type CompanionState, SeatSchema } from "./schema.ts";
import type { WakeChoice } from "./wake-prompts.ts";

const Seat = SeatSchema.max(31);

/** One chair of the Spy's look at the Grimoire. */
export const GrimoireSeatSchema = z.object({
  seat: Seat,
  name: z.string().max(60),
  character: CharacterIdSchema,
  alive: z.boolean(),
  /** Reminder tokens on the seat, in words ("Poisoned", "Is the Drunk"…). */
  reminders: z.array(z.string().max(60)).max(12),
});

export const InfoPayloadSchema = z.discriminatedUnion("kind", [
  /** Fingers: the Chef's pairs, the Empath's neighbours, the Chambermaid's count. */
  z.object({
    kind: z.literal("number"),
    value: z.number().int().min(0).max(20),
    label: z.string().max(80),
  }),
  /** A nod or a shake: the Fortune Teller. */
  z.object({ kind: z.literal("yes-no"), value: z.boolean(), label: z.string().max(80) }),
  /** A character token and two players, one of whom is it (Washerwoman, Librarian, Investigator). */
  z.object({
    kind: z.literal("players-character"),
    seats: z.array(Seat).max(4),
    character: CharacterIdSchema,
  }),
  /** One character token, maybe with the player it belongs to (Undertaker, Ravenkeeper, Grandmother). */
  z.object({ kind: z.literal("character"), character: CharacterIdSchema, seat: Seat.optional() }),
  /** Several character tokens (the Godfather's Outsiders). */
  z.object({ kind: z.literal("characters"), characters: z.array(CharacterIdSchema).max(8) }),
  /** The evil team: who the Demon is, who the Minions are, and (for the Demon) the bluffs. */
  z.object({
    kind: z.literal("evil-team"),
    demon: Seat.optional(),
    minions: z.array(Seat).max(8),
    bluffs: z.array(CharacterIdSchema).max(3).optional(),
  }),
  /** YOU ARE: a new character (the star-passed Imp, the Scarlet Woman, the Apprentice's gift). */
  z.object({
    kind: z.literal("you-are"),
    character: CharacterIdSchema,
    alignment: AlignmentSchema.optional(),
  }),
  /** The Spy's look at the whole Grimoire. */
  z.object({ kind: z.literal("grimoire"), seats: z.array(GrimoireSeatSchema).max(32) }),
  /** Anything else, in words. */
  z.object({ kind: z.literal("text"), text: z.string().min(1).max(500) }),
]);
export type InfoPayload = z.infer<typeof InfoPayloadSchema>;

export interface InfoSuggestion {
  readonly payload: InfoPayload;
  /** The player's ability is void tonight (drunk, poisoned): the Storyteller may lie. */
  readonly voided: boolean;
}

export interface SuggestOptions {
  /** The woken player's answer, in chairs — the Fortune Teller's two, the Ravenkeeper's one. */
  readonly choice?: WakeChoice;
  /** Chair → the seat id payloads carry. Default: the chair itself. */
  readonly seatId?: (chair: number) => number;
  /** Picks the decoys of a pair suggestion. */
  readonly rng?: () => number;
}

/** Reminder words for the Spy's Grimoire. */
function remindersOf(state: CompanionState, chair: number): string[] {
  const p = playerAt(state, chair);
  const out: string[] = [];
  if (p.believedCharacter) out.push(`Thinks they are the ${CHARACTERS[p.believedCharacter].name}`);
  if (p.poisoned) out.push("Poisoned");
  if ((p.drunkNights ?? 0) > 0) out.push("Drunk");
  if (p.protectedTonight) out.push("Safe tonight");
  if (p.redHerring) out.push("Red herring");
  if (p.butlerMaster !== undefined) out.push(`Master: ${playerAt(state, p.butlerMaster).name}`);
  if (p.usedAbility) out.push("No ability");
  if (p.registersDead) out.push("Registers as dead");
  return out;
}

/** The Spy's Grimoire: every chair's true character and its reminders. */
export function grimoireInfo(
  state: CompanionState,
  seatId: (chair: number) => number,
): InfoPayload {
  return {
    kind: "grimoire",
    seats: state.players
      .filter((p) => !p.left)
      .map((p) => ({
        seat: seatId(p.seat),
        name: p.name,
        character: p.character,
        alive: p.alive,
        reminders: remindersOf(state, p.seat),
      })),
  };
}

function pairInfo(
  state: CompanionState,
  chair: number,
  type: "townsfolk" | "outsider" | "minion",
  seatId: (chair: number) => number,
  rng: () => number,
): InfoPayload {
  const pair = firstNightPairSuggestion(state, chair, type, rng);
  if (!pair) return { kind: "number", value: 0, label: "Outsiders in play" };
  const seats = rng() < 0.5 ? [pair.realSeat, pair.decoySeat] : [pair.decoySeat, pair.realSeat];
  return { kind: "players-character", seats: seats.map(seatId), character: pair.character };
}

/**
 * The true answer for whoever `step` wakes, or `null` when there is nothing
 * to tell yet (the Fortune Teller hasn't picked) or nothing to tell at all
 * (the Poisoner just acts).
 */
export function suggestedInfo(
  state: CompanionState,
  step: NightStep,
  opts: SuggestOptions = {},
): InfoSuggestion | null {
  const seatId = opts.seatId ?? ((chair: number) => chair);
  const rng = opts.rng ?? Math.random;
  const picks = opts.choice?.seats ?? [];
  const minions = () =>
    state.players
      .filter((p) => !p.left && CHARACTERS[p.character].type === "minion")
      .map((p) => seatId(p.seat));

  switch (step.kind) {
    case "minion-info": {
      const demon = demonPlayer(state);
      return {
        payload: {
          kind: "evil-team",
          ...(demon ? { demon: seatId(demon.seat) } : {}),
          minions: minions(),
        },
        voided: false,
      };
    }
    case "demon-info":
      return {
        payload: { kind: "evil-team", minions: minions(), bluffs: state.demonBluffs.slice(0, 3) },
        voided: false,
      };
    case "lunatic-info": {
      // The Lunatic believes they are the Demon: show them as many "Minions"
      // as there really are, picked from everyone else — never the truth.
      const count = minions().length;
      const others = state.players.filter((p) => !p.left && p.seat !== step.seat);
      const fake: number[] = [];
      const pool = [...others];
      while (fake.length < count && pool.length > 0) {
        const [pick] = pool.splice(Math.floor(rng() * pool.length), 1);
        if (pick) fake.push(seatId(pick.seat));
      }
      return {
        payload: { kind: "evil-team", minions: fake, bluffs: state.demonBluffs.slice(0, 3) },
        voided: false,
      };
    }
    case "you-are-imp":
      return { payload: { kind: "you-are", character: "imp" }, voided: false };
    case "apprentice": {
      const p = playerAt(state, step.seat);
      return p.apprenticeAbility
        ? {
            payload: {
              kind: "you-are",
              character: p.apprenticeAbility,
              ...(p.alignment ? { alignment: p.alignment } : {}),
            },
            voided: false,
          }
        : null;
    }
    case "wake":
      break;
    default:
      return null;
  }

  const p = playerAt(state, step.seat);
  const voided = step.isDrunk || step.poisoned || step.drunk === true || abilityVoid(state, p);
  const out = (payload: InfoPayload): InfoSuggestion => ({ payload, voided });
  switch (step.character) {
    case "washerwoman":
      return out(pairInfo(state, step.seat, "townsfolk", seatId, rng));
    case "librarian":
      return out(pairInfo(state, step.seat, "outsider", seatId, rng));
    case "investigator":
      return out(pairInfo(state, step.seat, "minion", seatId, rng));
    case "chef":
      return out({ kind: "number", value: chefNumber(state), label: "pairs of evil neighbours" });
    case "empath":
      return out({
        kind: "number",
        value: empathNumber(state, step.seat),
        label: "of your alive neighbours are evil",
      });
    case "fortune-teller": {
      const [a, b] = picks;
      if (a === undefined || b === undefined) return null;
      return out({
        kind: "yes-no",
        value: fortuneTellerPing(state, a, b),
        label: "Is either the Demon?",
      });
    }
    case "undertaker": {
      const executed = undertakerInfo(state);
      return executed ? out({ kind: "character", character: executed }) : null;
    }
    case "ravenkeeper": {
      const [pick] = picks;
      if (pick === undefined) return null;
      return out({
        kind: "character",
        character: apparentCharacter(playerAt(state, pick)),
        seat: seatId(pick),
      });
    }
    case "spy":
      return out(grimoireInfo(state, seatId));
    case "grandmother": {
      if (p.grandchild === undefined) return null;
      const child = playerAt(state, p.grandchild);
      return out({ kind: "character", character: child.character, seat: seatId(child.seat) });
    }
    case "chambermaid":
      return picks.length === 2
        ? out({
            kind: "number",
            value: chambermaidNumber(state, [...picks]),
            label: "of them woke tonight for their ability",
          })
        : null;
    case "godfather": {
      if (!(state.phase.kind === "night" && state.phase.night === 1)) return null;
      const outsiders = state.players
        .filter((x) => !x.left && CHARACTERS[x.character].type === "outsider")
        .map((x) => x.character);
      return out({ kind: "characters", characters: outsiders });
    }
    default:
      return null;
  }
}

/** One line for the Grimoire log: what the player was told, in words. */
export function describeInfo(payload: InfoPayload, nameOf: (seat: number) => string): string {
  const char = (id: CharacterId) => CHARACTERS[id].name;
  switch (payload.kind) {
    case "number":
      return `${payload.value} (${payload.label})`;
    case "yes-no":
      return payload.value ? "YES" : "NO";
    case "players-character":
      return `${char(payload.character)}: ${payload.seats.map(nameOf).join(" or ")}`;
    case "character":
      return payload.seat !== undefined
        ? `${nameOf(payload.seat)} is the ${char(payload.character)}`
        : `the ${char(payload.character)}`;
    case "characters":
      return payload.characters.length > 0 ? payload.characters.map(char).join(", ") : "none";
    case "evil-team": {
      const parts: string[] = [];
      if (payload.demon !== undefined) parts.push(`Demon: ${nameOf(payload.demon)}`);
      parts.push(`Minions: ${payload.minions.map(nameOf).join(", ") || "none"}`);
      if (payload.bluffs) parts.push(`bluffs: ${payload.bluffs.map(char).join(", ")}`);
      return parts.join(" · ");
    }
    case "you-are":
      return `YOU ARE the ${char(payload.character)}${payload.alignment ? ` (${payload.alignment})` : ""}`;
    case "grimoire":
      return "the Grimoire";
    case "text":
      return payload.text;
  }
}
