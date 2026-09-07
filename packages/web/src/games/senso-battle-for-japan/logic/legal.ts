import type {
  Action,
  CardId,
  Clan,
  RewardAction,
  RewardKind,
} from "@boardgames/core/games/senso-battle-for-japan/types";
import { isRewardAction, rewardKindOf } from "@boardgames/core/games/senso-battle-for-japan/types";

// Pure indexers over the server's enumerated legal actions. The board never
// constructs an action: every click resolves to one of these objects, so what
// is sent is byte-for-byte what the engine offered.

export function squareKey(region: number, square: number): string {
  return `${region}:${square}`;
}

export function playableCards(legal: readonly Action[]): Set<CardId> {
  const out = new Set<CardId>();
  for (const a of legal) if (a.type === "play") out.add(a.card);
  return out;
}

export function passAction(legal: readonly Action[]): Action | undefined {
  return legal.find((a) => a.type === "pass");
}

function rewards(legal: readonly Action[], as: Clan | undefined): RewardAction[] {
  return legal.filter((a): a is RewardAction => isRewardAction(a) && a.as === as);
}

/** Clans an Emperor may act as right now (distinct `as` values on offer). */
export function emperorClans(legal: readonly Action[]): Clan[] {
  const out: Clan[] = [];
  for (const a of legal) {
    if (isRewardAction(a) && a.as !== undefined && !out.includes(a.as)) out.push(a.as);
  }
  return out;
}

export function kindAvailable(legal: readonly Action[], kind: RewardKind, as?: Clan): boolean {
  return rewards(legal, as).some((a) => rewardKindOf(a) === kind);
}

/** Own cubes that can start a Balance reward, keyed `region:square`. */
export function balanceSources(
  legal: readonly Action[],
  as?: Clan,
): Map<string, { region: number; square: number }> {
  const out = new Map<string, { region: number; square: number }>();
  for (const a of rewards(legal, as)) {
    if (a.type === "balance-swap" || a.type === "balance-move" || a.type === "balance-replace") {
      out.set(squareKey(a.region, a.square), { region: a.region, square: a.square });
    }
  }
  return out;
}

export interface BalanceTargets {
  /** The opponent cube directly above the source. */
  swap: RewardAction | null;
  /** Adjacent regions with an empty square → the action that moves there. */
  moves: Map<number, RewardAction>;
  /** Adjacent full regions → the action replacing their lowest cube. */
  replaces: Map<number, RewardAction>;
}

export function balanceTargets(
  legal: readonly Action[],
  from: { region: number; square: number },
  as?: Clan,
): BalanceTargets {
  const out: BalanceTargets = { swap: null, moves: new Map(), replaces: new Map() };
  for (const a of rewards(legal, as)) {
    if (!("square" in a) || a.region !== from.region || a.square !== from.square) continue;
    if (a.type === "balance-swap") out.swap = a;
    else if (a.type === "balance-move") out.moves.set(a.to, a);
    else if (a.type === "balance-replace") out.replaces.set(a.to, a);
  }
  return out;
}

export function determinationRegions(
  legal: readonly Action[],
  as?: Clan,
): Map<number, RewardAction> {
  const out = new Map<number, RewardAction>();
  for (const a of rewards(legal, as)) if (a.type === "determination") out.set(a.region, a);
  return out;
}

export function aggressionSquares(legal: readonly Action[], as?: Clan): Map<string, RewardAction> {
  const out = new Map<string, RewardAction>();
  for (const a of rewards(legal, as)) {
    if (a.type === "aggression") out.set(squareKey(a.region, a.square), a);
  }
  return out;
}

export function bonusRegions(legal: readonly Action[]): Map<number, Action> {
  const out = new Map<number, Action>();
  for (const a of legal) if (a.type === "bonus-place") out.set(a.region, a);
  return out;
}
