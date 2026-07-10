import { builtStageEffects, countColor, scienceProfile } from "./board";
import { getCardDef } from "./cards";
import type { CardEffect, GameState, PlayerState, ScienceSymbol, WonderStageEffect } from "./types";
import { cardIdName, leftOf, rightOf, SCIENCE_SYMBOLS } from "./types";

export interface ScoreBreakdown {
  military: number;
  coins: number;
  wonder: number;
  civilian: number;
  commercial: number;
  guilds: number;
  science: number;
  total: number;
}

export interface SevenWondersResult {
  breakdowns: ScoreBreakdown[];
  totals: number[];
  winner: number;
}

/**
 * Science: n^2 per symbol plus 7 per complete set. Wildcards (Scientists
 * Guild, Babylon stages) are assigned by trying every combination and keeping
 * the best — always optimal for the player, matching digital implementations.
 */
export function scoreScience(counts: Record<ScienceSymbol, number>, wildcards: number): number {
  if (wildcards === 0) {
    const values = SCIENCE_SYMBOLS.map((s) => counts[s]);
    return values.reduce((sum, n) => sum + n * n, 0) + 7 * Math.min(...values);
  }
  let best = 0;
  for (const symbol of SCIENCE_SYMBOLS) {
    const next = { ...counts, [symbol]: counts[symbol] + 1 };
    best = Math.max(best, scoreScience(next, wildcards - 1));
  }
  return best;
}

function pointEffects(player: PlayerState): Array<{
  effect: CardEffect | WonderStageEffect;
  source: "blue" | "yellow" | "purple" | "wonder" | "other";
}> {
  const entries: Array<{
    effect: CardEffect | WonderStageEffect;
    source: "blue" | "yellow" | "purple" | "wonder" | "other";
  }> = [];
  for (const id of player.tableau) {
    const def = getCardDef(cardIdName(id));
    const source =
      def.color === "blue"
        ? "blue"
        : def.color === "yellow"
          ? "yellow"
          : def.color === "purple"
            ? "purple"
            : "other";
    for (const effect of def.effects) entries.push({ effect, source });
  }
  for (const effect of builtStageEffects(player)) entries.push({ effect, source: "wonder" });
  return entries;
}

function scopeTargets(
  state: GameState,
  playerIndex: number,
  scopes: readonly ("self" | "left" | "right")[],
): PlayerState[] {
  return scopes.map((scope) => {
    if (scope === "self") return state.players[playerIndex];
    const idx =
      scope === "left"
        ? leftOf(playerIndex, state.playerCount)
        : rightOf(playerIndex, state.playerCount);
    return state.players[idx];
  });
}

function endGamePoints(
  effect: CardEffect | WonderStageEffect,
  state: GameState,
  playerIndex: number,
): number {
  switch (effect.kind) {
    case "points":
      return effect.amount;
    case "points-per-card":
      return (
        effect.amount *
        scopeTargets(state, playerIndex, effect.scopes).reduce(
          (sum, p) => sum + countColor(p, effect.color),
          0,
        )
      );
    case "points-per-stage":
      return (
        effect.amount *
        scopeTargets(state, playerIndex, effect.scopes).reduce((sum, p) => sum + p.stagesBuilt, 0)
      );
    case "points-per-defeat":
      return (
        effect.amount *
        scopeTargets(state, playerIndex, effect.scopes).reduce(
          (sum, p) => sum + p.militaryTokens.filter((t) => t < 0).length,
          0,
        )
      );
    default:
      return 0;
  }
}

/**
 * Olympia B stage 3: copy the most valuable guild owned by either neighbor,
 * evaluated as if it sat on this player's board. Copying the Scientists Guild
 * is worth the science-score delta of one extra wildcard.
 */
function bestCopiedGuildValue(state: GameState, playerIndex: number): number {
  const player = state.players[playerIndex];
  const neighbors = [
    state.players[leftOf(playerIndex, state.playerCount)],
    state.players[rightOf(playerIndex, state.playerCount)],
  ];
  let best = 0;
  for (const neighbor of neighbors) {
    for (const id of neighbor.tableau) {
      const def = getCardDef(cardIdName(id));
      if (def.color !== "purple") continue;
      let value = 0;
      for (const effect of def.effects) {
        if (effect.kind === "science-wildcard") {
          const { counts, wildcards } = scienceProfile(player);
          value += scoreScience(counts, wildcards + 1) - scoreScience(counts, wildcards);
        } else {
          value += endGamePoints(effect, state, playerIndex);
        }
      }
      best = Math.max(best, value);
    }
  }
  return best;
}

export function scoreFinal(state: GameState): ScoreBreakdown[] {
  return state.players.map((player, i) => {
    const military = player.militaryTokens.reduce((a, b) => a + b, 0);
    const coins = Math.floor(player.coins / 3);

    let wonder = 0;
    let civilian = 0;
    let commercial = 0;
    let guilds = 0;
    for (const { effect, source } of pointEffects(player)) {
      const points = endGamePoints(effect, state, i);
      if (source === "blue") civilian += points;
      else if (source === "yellow") commercial += points;
      else if (source === "purple") guilds += points;
      else if (source === "wonder") wonder += points;
    }
    if (builtStageEffects(player).some((e) => e.kind === "copy-guild")) {
      guilds += bestCopiedGuildValue(state, i);
    }

    const { counts, wildcards } = scienceProfile(player);
    const science = scoreScience(counts, wildcards);

    const total = military + coins + wonder + civilian + commercial + guilds + science;
    return { military, coins, wonder, civilian, commercial, guilds, science, total };
  });
}

/** Winner: highest total, ties broken by most coins, then lowest seat index. */
export function determineWinner(state: GameState, breakdowns: ScoreBreakdown[]): number {
  let winner = 0;
  for (let i = 1; i < breakdowns.length; i++) {
    const better =
      breakdowns[i].total > breakdowns[winner].total ||
      (breakdowns[i].total === breakdowns[winner].total &&
        state.players[i].coins > state.players[winner].coins);
    if (better) winner = i;
  }
  return winner;
}
