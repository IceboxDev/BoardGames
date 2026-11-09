/**
 * The companion's tracker for a Duet game played with the physical cards: the
 * players say what each guess revealed, and this keeps the timer tokens (with
 * the mission's free mistakes, `spendTokens`), agents found, whose clue it is,
 * sudden death and the result — the same rules as the online game
 * (`../rules.ts`), with the table as the source of truth for the cards.
 */

import { z } from "zod";
import { spendTokens } from "../rules.ts";
import { type CityId, CityIdSchema, missionConfig } from "./map.ts";

export const TOTAL_AGENTS = 15;

export type TableGamePhase = "clue" | "sudden-death" | "won" | "lost";

export interface TableGame {
  /** The mission played, or null for a game outside a campaign. */
  city: CityId | null;
  tokensTotal: number;
  /** Free mistakes the mission starts with; null = every token is bystander side (the standard game). */
  mistakesTotal: number | null;
  tokens: number;
  mistakesLeft: number;
  agentsFound: number;
  phase: TableGamePhase;
  /** Who gives the clue (or, in sudden death, picks): 0 or 1. */
  giver: 0 | 1;
  /** A player whose side has no agents left only guesses from then on. */
  cluedOut: [boolean, boolean];
  /** Clues given so far (a turn = one clue). */
  turns: number;
  /** How it ended. */
  lostBy: "assassin" | "sudden-death" | null;
}

/** A tracked game as the companion keeps it on the device (validated when read back). */
export const TableGameSchema = z.object({
  city: CityIdSchema.nullable(),
  tokensTotal: z.number().int().min(1).max(11),
  mistakesTotal: z.number().int().min(0).max(11).nullable(),
  tokens: z.number().int().min(0).max(11),
  mistakesLeft: z.number().int().min(0).max(11),
  agentsFound: z.number().int().min(0).max(TOTAL_AGENTS),
  phase: z.enum(["clue", "sudden-death", "won", "lost"]),
  giver: z.union([z.literal(0), z.literal(1)]),
  cluedOut: z.tuple([z.boolean(), z.boolean()]),
  turns: z.number().int().min(0),
  lostBy: z.enum(["assassin", "sudden-death"]).nullable(),
}) satisfies z.ZodType<TableGame>;

export type TableEvent =
  | { type: "agent" }
  | { type: "bystander" }
  | { type: "assassin" }
  /** The guesser stops: the turn ends without a mistake. */
  | { type: "stop" }
  /** The clue giver's side has no agents left to clue for. */
  | { type: "clued-out"; player: 0 | 1 }
  | { type: "swap-giver" };

export function newTableGame(
  opts: { city: CityId } | { city: null; tokens: number },
  firstGiver: 0 | 1 = 0,
): TableGame {
  const { timerTokens, mistakes } =
    opts.city === null
      ? { timerTokens: opts.tokens, mistakes: opts.tokens }
      : missionConfig(opts.city);
  const limited = mistakes < timerTokens;
  return {
    city: opts.city,
    tokensTotal: timerTokens,
    mistakesTotal: limited ? mistakes : null,
    tokens: timerTokens,
    mistakesLeft: limited ? mistakes : timerTokens,
    agentsFound: 0,
    phase: "clue",
    giver: firstGiver,
    cluedOut: [false, false],
    turns: 0,
    lostBy: null,
  };
}

const other = (p: 0 | 1): 0 | 1 => (p === 0 ? 1 : 0);

/** The next clue comes from the partner, unless their side has nothing left to clue. */
function nextGiver(game: TableGame): 0 | 1 {
  const partner = other(game.giver);
  return game.cluedOut[partner] ? game.giver : partner;
}

function endTurn(game: TableGame, end: "bystander" | "stopped"): TableGame {
  const spent = spendTokens(game, end);
  const turns = game.turns + 1;
  if (spent.tokens === 0) {
    return {
      ...game,
      tokens: 0,
      mistakesLeft: spent.mistakesLeft,
      turns,
      phase: "sudden-death",
      giver: nextGiver(game),
    };
  }
  return {
    ...game,
    tokens: spent.tokens,
    mistakesLeft: spent.mistakesLeft,
    turns,
    giver: nextGiver(game),
  };
}

/** What happens to the game; an event that doesn't apply returns it unchanged. */
export function applyTableEvent(game: TableGame, event: TableEvent): TableGame {
  if (game.phase === "won" || game.phase === "lost") return game;
  const suddenDeath = game.phase === "sudden-death";
  switch (event.type) {
    case "agent": {
      const agentsFound = game.agentsFound + 1;
      if (agentsFound >= TOTAL_AGENTS) {
        return {
          ...game,
          agentsFound: TOTAL_AGENTS,
          phase: "won",
          turns: game.turns + (suddenDeath ? 0 : 1),
        };
      }
      // In sudden death the players take turns picking.
      return suddenDeath
        ? { ...game, agentsFound, giver: nextGiver(game) }
        : { ...game, agentsFound };
    }
    case "bystander":
      return suddenDeath
        ? { ...game, phase: "lost", lostBy: "sudden-death" }
        : endTurn(game, "bystander");
    case "assassin":
      return {
        ...game,
        phase: "lost",
        lostBy: "assassin",
        turns: game.turns + (suddenDeath ? 0 : 1),
      };
    case "stop":
      return suddenDeath ? game : endTurn(game, "stopped");
    case "clued-out": {
      const cluedOut: [boolean, boolean] = [...game.cluedOut];
      cluedOut[event.player] = true;
      const next = { ...game, cluedOut };
      // The giver who just ran out hands the clue over.
      return game.giver === event.player && !cluedOut[other(event.player)]
        ? { ...next, giver: other(event.player) }
        : next;
    }
    case "swap-giver":
      return { ...game, giver: other(game.giver) };
  }
}

/** Tokens left that are checkmark side (turns that aren't free mistakes). */
export function checkmarkTokens(
  game: Pick<TableGame, "tokens" | "mistakesLeft" | "mistakesTotal">,
): number {
  return game.mistakesTotal === null ? 0 : Math.max(0, game.tokens - game.mistakesLeft);
}
