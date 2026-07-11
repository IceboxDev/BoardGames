import { getCardDef } from "./cards";
import type {
  CardColor,
  CardEffect,
  GameState,
  PlayerState,
  ScienceSymbol,
  WonderStageEffect,
} from "./types";
import { cardIdName, leftOf, rightOf } from "./types";
import { getWonderDef } from "./wonders";

/** Read-only queries over a player's board (tableau + built wonder stages). */

export function tableauNames(player: PlayerState): Set<string> {
  return new Set(player.tableau.map(cardIdName));
}

export function builtStageEffects(player: PlayerState): WonderStageEffect[] {
  const side = getWonderDef(player.wonderId).sides[player.side];
  return side.stages.slice(0, player.stagesBuilt).flatMap((s) => [...s.effects]);
}

export function hasBuiltStageEffect(player: PlayerState, kind: WonderStageEffect["kind"]): boolean {
  return builtStageEffects(player).some((e) => e.kind === kind);
}

export function countColor(player: PlayerState, color: CardColor): number {
  return player.tableau.filter((id) => getCardDef(cardIdName(id)).color === color).length;
}

export function countShields(player: PlayerState): number {
  let shields = 0;
  for (const id of player.tableau) {
    for (const effect of getCardDef(cardIdName(id)).effects) {
      if (effect.kind === "shields") shields += effect.amount;
    }
  }
  for (const effect of builtStageEffects(player)) {
    if (effect.kind === "shields") shields += effect.amount;
  }
  return shields + player.bonusShields; // Edifice shield rewards
}

export interface ScienceProfile {
  counts: Record<ScienceSymbol, number>;
  wildcards: number;
}

/** Science symbols from green cards plus wildcards (Scientists Guild, Babylon stages). */
export function scienceProfile(player: PlayerState): ScienceProfile {
  const counts: Record<ScienceSymbol, number> = { gear: 0, compass: 0, tablet: 0 };
  let wildcards = 0;
  for (const id of player.tableau) {
    for (const effect of getCardDef(cardIdName(id)).effects) {
      if (effect.kind === "science") counts[effect.symbol]++;
      if (effect.kind === "science-wildcard") wildcards++;
    }
  }
  for (const effect of builtStageEffects(player)) {
    if (effect.kind === "science") counts[effect.symbol]++;
    if (effect.kind === "science-wildcard") wildcards++;
  }
  return { counts, wildcards };
}

function scopePlayers(
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

/** Coins granted immediately when an effect enters play. Point effects score at game end. */
export function instantCoins(
  effect: CardEffect | WonderStageEffect,
  state: GameState,
  playerIndex: number,
): number {
  switch (effect.kind) {
    case "coins":
      return effect.amount;
    case "coins-per-card":
      return (
        effect.amount *
        scopePlayers(state, playerIndex, effect.scopes).reduce(
          (sum, p) => sum + countColor(p, effect.color),
          0,
        )
      );
    case "coins-per-stage":
      return (
        effect.amount *
        scopePlayers(state, playerIndex, effect.scopes).reduce((sum, p) => sum + p.stagesBuilt, 0)
      );
    default:
      return 0;
  }
}
