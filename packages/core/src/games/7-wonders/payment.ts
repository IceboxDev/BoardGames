import { getCardDef } from "./cards";
import type {
  CardEffect,
  Cost,
  GameState,
  Payment,
  PlayerState,
  ResourceType,
  WonderStageEffect,
} from "./types";
import { cardIdName, leftOf, RESOURCE_TYPES, rightOf } from "./types";
import { getWonderDef } from "./wonders";

/**
 * Resource/payment solver. Production is modeled as a list of entries, one
 * unit each, whose `mask` is a bitset over RESOURCE_TYPES (multi-bit = the
 * card produces a choice of one). Solving a cost is a small exact search
 * assigning each required unit to an unused own/left/right entry, tracking
 * coins owed to each neighbor, and returning the Pareto-minimal coin splits.
 */

const RESOURCE_BIT: Record<ResourceType, number> = Object.fromEntries(
  RESOURCE_TYPES.map((r, i) => [r, 1 << i]),
) as Record<ResourceType, number>;

export interface ProductionEntry {
  /** Bitset over RESOURCE_TYPES; >1 bit = choose one unit. */
  mask: number;
}

function entriesFromEffect(effect: CardEffect | WonderStageEffect): ProductionEntry[] {
  if (effect.kind !== "production") return [];
  const mask = effect.resources.reduce((m, r) => m | RESOURCE_BIT[r], 0);
  const count = effect.resources.length === 1 ? (effect.count ?? 1) : 1;
  return Array.from({ length: count }, () => ({ mask }));
}

function builtStageEffects(player: PlayerState): WonderStageEffect[] {
  const side = getWonderDef(player.wonderId).sides[player.side];
  return side.stages.slice(0, player.stagesBuilt).flatMap((s) => [...s.effects]);
}

/** Everything the player can use for their own builds. */
export function getOwnProduction(state: GameState, playerIndex: number): ProductionEntry[] {
  const player = state.players[playerIndex];
  const entries: ProductionEntry[] = [
    { mask: RESOURCE_BIT[getWonderDef(player.wonderId).sides[player.side].initialResource] },
  ];
  for (const cardId of player.tableau) {
    for (const effect of getCardDef(cardIdName(cardId)).effects) {
      entries.push(...entriesFromEffect(effect));
    }
  }
  for (const effect of builtStageEffects(player)) {
    entries.push(...entriesFromEffect(effect));
  }
  // Edifice production rewards (each a choose-one set). Not tradeable to
  // neighbours (getTradeableProduction omits them), like yellow/stage output.
  for (const set of player.bonusProduction) {
    entries.push({ mask: set.reduce((m, r) => m | RESOURCE_BIT[r], 0) });
  }
  return entries;
}

/**
 * What neighbors can buy from this player: the wonder's initial resource and
 * brown/grey card production only. Yellow-card and wonder-stage production
 * (Forum, Caravansery, Alexandria stages) is never tradeable.
 */
export function getTradeableProduction(state: GameState, playerIndex: number): ProductionEntry[] {
  const player = state.players[playerIndex];
  const entries: ProductionEntry[] = [
    { mask: RESOURCE_BIT[getWonderDef(player.wonderId).sides[player.side].initialResource] },
  ];
  for (const cardId of player.tableau) {
    const def = getCardDef(cardIdName(cardId));
    if (def.color !== "brown" && def.color !== "grey") continue;
    for (const effect of def.effects) {
      entries.push(...entriesFromEffect(effect));
    }
  }
  return entries;
}

const RAW_MASK = (["wood", "stone", "clay", "ore"] as const).reduce(
  (m, r) => m | RESOURCE_BIT[r],
  0,
);

/** Coins one unit of `resource` costs `buyer` when bought from the `side` neighbor. */
export function getTradeCost(
  state: GameState,
  buyer: number,
  side: "left" | "right",
  resource: ResourceType,
): 1 | 2 {
  const kind = RESOURCE_BIT[resource] & RAW_MASK ? "raw" : "manufactured";
  const player = state.players[buyer];
  const effects: (CardEffect | WonderStageEffect)[] = [
    ...player.tableau.flatMap((id) => [...getCardDef(cardIdName(id)).effects]),
    ...builtStageEffects(player),
  ];
  for (const effect of effects) {
    if (
      effect.kind === "trade-discount" &&
      effect.resources === kind &&
      effect.neighbors.includes(side)
    ) {
      return 1;
    }
  }
  return 2;
}

interface Split {
  left: number;
  right: number;
}

/**
 * All Pareto-minimal ways for `playerIndex` to pay `cost`, or null when the
 * cost is unaffordable even with trading. Coin components (bank) are checked
 * against the player's current coins together with the trade coins.
 */
export function solvePayments(state: GameState, playerIndex: number, cost: Cost): Payment[] | null {
  const player = state.players[playerIndex];
  const bankCoins = cost.coins ?? 0;
  if (bankCoins > player.coins) return null;

  const required: ResourceType[] = [];
  for (const [resource, amount] of Object.entries(cost.resources ?? {})) {
    for (let i = 0; i < amount; i++) required.push(resource as ResourceType);
  }
  if (required.length === 0) {
    return [{ kind: "resources", left: 0, right: 0 }];
  }

  const own = getOwnProduction(state, playerIndex);
  const leftIdx = leftOf(playerIndex, state.playerCount);
  const rightIdx = rightOf(playerIndex, state.playerCount);
  const left = getTradeableProduction(state, leftIdx);
  const right = getTradeableProduction(state, rightIdx);

  // Process scarce resources first — cheap ordering heuristic that tightens
  // pruning without affecting the result set.
  const providerCount = (r: ResourceType) => {
    const bit = RESOURCE_BIT[r];
    return [...own, ...left, ...right].filter((e) => e.mask & bit).length;
  };
  required.sort((a, b) => providerCount(a) - providerCount(b));

  const budget = player.coins - bankCoins;
  const solutions: Split[] = [];

  const dominated = (s: Split) =>
    solutions.some((sol) => sol.left <= s.left && sol.right <= s.right);

  const pools = [own, left, right] as const;
  const used = pools.map((pool) => pool.map(() => false));

  const tryPool = (
    unit: number,
    poolIndex: 0 | 1 | 2,
    coinsFor: (r: ResourceType) => number,
    acc: Split,
  ) => {
    const resource = required[unit];
    const bit = RESOURCE_BIT[resource];
    const pool = pools[poolIndex];
    const poolUsed = used[poolIndex];
    const seenMasks = new Set<number>();
    for (let i = 0; i < pool.length; i++) {
      if (poolUsed[i] || !(pool[i].mask & bit)) continue;
      // Identical unused entries are interchangeable — try only the first.
      if (seenMasks.has(pool[i].mask)) continue;
      seenMasks.add(pool[i].mask);
      const coins = coinsFor(resource);
      const next: Split = {
        left: acc.left + (poolIndex === 1 ? coins : 0),
        right: acc.right + (poolIndex === 2 ? coins : 0),
      };
      if (next.left + next.right > budget || dominated(next)) continue;
      poolUsed[i] = true;
      solve(unit + 1, next);
      poolUsed[i] = false;
    }
  };

  const solve = (unit: number, acc: Split) => {
    if (unit === required.length) {
      if (!dominated(acc)) {
        // Remove now-dominated earlier solutions, then record.
        for (let i = solutions.length - 1; i >= 0; i--) {
          if (solutions[i].left >= acc.left && solutions[i].right >= acc.right) {
            solutions.splice(i, 1);
          }
        }
        solutions.push(acc);
      }
      return;
    }
    tryPool(unit, 0, () => 0, acc);
    tryPool(unit, 1, (r) => getTradeCost(state, playerIndex, "left", r), acc);
    tryPool(unit, 2, (r) => getTradeCost(state, playerIndex, "right", r), acc);
  };

  solve(0, { left: 0, right: 0 });

  if (solutions.length === 0) return null;
  solutions.sort((a, b) => a.left + a.right - (b.left + b.right) || a.left - b.left);
  return solutions.map((s) => ({ kind: "resources", left: s.left, right: s.right }));
}

/** True when `payment` is one of the solver's feasible splits for `cost`. */
export function isValidPayment(
  state: GameState,
  playerIndex: number,
  cost: Cost,
  payment: { left: number; right: number },
): boolean {
  const options = solvePayments(state, playerIndex, cost);
  if (!options) return false;
  // Any split that covers a Pareto-minimal one is feasible (paying extra is
  // pointless but the solver only emits minimal splits, so exact match).
  return options.some(
    (o) => o.kind === "resources" && o.left === payment.left && o.right === payment.right,
  );
}
