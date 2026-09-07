import { highestEmpty, isFull, lowestOccupied } from "./board";
import { isNinja, rankOf, suitOf } from "./deck";
import { REGIONS } from "./map";
import { RULINGS } from "./rulings";
import type {
  Action,
  CardId,
  Clan,
  GameState,
  RewardAction,
  RewardKind,
  RewardSlot,
  RewardTier,
  TrickPlay,
} from "./types";

export { RULINGS } from "./rulings";

// ---------------------------------------------------------------------------
// Active player
// ---------------------------------------------------------------------------

export function getActivePlayer(state: GameState): number {
  switch (state.phase) {
    case "trick":
      return state.turn;
    case "trick-settle":
      // The winner leads next; reporting them here means the server's
      // `ai-thinking` broadcast fires only when an AI is about to lead.
      return state.completedTrick?.winner ?? -1;
    case "rewards":
      return state.rewardQueue[0]?.player ?? -1;
    case "bonus":
      return state.bonusQueue[0] ?? -1;
    default:
      return -1;
  }
}

// ---------------------------------------------------------------------------
// Trick play
// ---------------------------------------------------------------------------

/** Cards a hand may play against the current lead suit. */
export function legalPlays(hand: readonly CardId[], leadSuit: Clan | null): CardId[] {
  if (leadSuit === null) return [...hand];
  const follow = hand.filter((c) => suitOf(c) === leadSuit);
  if (follow.length === 0) return [...hand];
  if (RULINGS.ninjaFollowsSuit) return follow;
  return [...follow, ...hand.filter(isNinja)];
}

/**
 * Seat that wins the conflict: any Ninja (Jade beats Wood), else the highest
 * card of the advantage suit, else the highest card of the leading suit.
 */
export function trickWinner(
  plays: readonly TrickPlay[],
  trump: Clan,
  leadSuit: Clan | null,
): number {
  if (plays.length === 0) throw new Error("Cannot resolve an empty trick");
  const jade = plays.find((p) => p.card === "ninja-jade");
  if (jade) return jade.seat;
  const wood = plays.find((p) => p.card === "ninja-wood");
  if (wood) return wood.seat;

  const lead = leadSuit ?? suitOf(plays[0].card);
  let best: TrickPlay | null = null;
  let bestKey = -1;
  for (const play of plays) {
    const suit = suitOf(play.card);
    if (suit === null) continue;
    const key = suit === trump ? 100 + rankOf(play.card) : suit === lead ? rankOf(play.card) : -1;
    if (key > bestKey) {
      bestKey = key;
      best = play;
    }
  }
  return (best ?? plays[0]).seat;
}

// ---------------------------------------------------------------------------
// Reward tiers
// ---------------------------------------------------------------------------

export function tierFor(tricks: number): RewardTier | null {
  if (tricks >= 7) return 7;
  if (tricks >= 5) return 5;
  if (tricks >= 3) return 3;
  if (tricks >= 1) return 1;
  return null;
}

export function kindsForTier(tier: RewardTier): RewardKind[] {
  switch (tier) {
    case 1:
      return ["balance"];
    case 3:
      return ["balance", "determination"];
    default:
      return ["balance", "determination", "aggression"];
  }
}

export function kindsAvailable(slot: RewardSlot): RewardKind[] {
  return kindsForTier(slot.tier).filter((k) => !slot.used.includes(k));
}

// ---------------------------------------------------------------------------
// Affected regions
// ---------------------------------------------------------------------------

export function isLocked(state: GameState, region: number, seat: number): boolean {
  return state.affected.some((a) => a.region === region && a.by !== seat);
}

/** Regions an action interacts with — the destination for moves. */
export function affectedRegionsOf(action: RewardAction): number[] {
  switch (action.type) {
    case "balance-swap":
    case "determination":
    case "aggression":
      return [action.region];
    case "balance-move":
    case "balance-replace":
      return RULINGS.moveSourceIsAffected ? [action.to, action.region] : [action.to];
  }
}

/** A cube that is not `clan`'s. Neutral (unseated) cubes count as opponents by ruling. */
export function isOpponentCube(
  state: GameState,
  clan: Clan,
  cube: Clan | null | undefined,
): cube is Clan {
  if (cube === null || cube === undefined) return false;
  if (cube === clan) return false;
  if (!RULINGS.neutralCubesAreOpponents && !state.seatedClans.includes(cube)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Reward enumerators. `as` is attached only when given (Emperor seat).
// ---------------------------------------------------------------------------

function withAs<T extends RewardAction>(action: T, as: Clan | undefined): T {
  return as === undefined ? action : { ...action, as };
}

export function balanceSwapActions(
  state: GameState,
  clan: Clan,
  seat: number,
  as?: Clan,
): RewardAction[] {
  const out: RewardAction[] = [];
  state.board.forEach((squares, region) => {
    if (isLocked(state, region, seat)) return;
    for (let square = 1; square < squares.length; square++) {
      if (squares[square] === clan && isOpponentCube(state, clan, squares[square - 1])) {
        out.push(withAs({ type: "balance-swap", region, square }, as));
      }
    }
  });
  return out;
}

export function balanceMoveActions(
  state: GameState,
  clan: Clan,
  seat: number,
  as?: Clan,
): RewardAction[] {
  const out: RewardAction[] = [];
  state.board.forEach((squares, region) => {
    squares.forEach((cube, square) => {
      if (cube !== clan) return;
      for (const to of REGIONS[region].adjacent) {
        if (isLocked(state, to, seat)) continue;
        if (highestEmpty(state.board[to]) === -1) continue;
        out.push(withAs({ type: "balance-move", region, square, to }, as));
      }
    });
  });
  return out;
}

/** Balance's fallback applies only when every region adjacent to the source is full. */
export function canBalanceReplaceFrom(state: GameState, region: number): boolean {
  return REGIONS[region].adjacent.every((to) => isFull(state.board[to]));
}

export function balanceReplaceActions(
  state: GameState,
  clan: Clan,
  seat: number,
  as?: Clan,
): RewardAction[] {
  const out: RewardAction[] = [];
  state.board.forEach((squares, region) => {
    if (!canBalanceReplaceFrom(state, region)) return;
    squares.forEach((cube, square) => {
      if (cube !== clan) return;
      for (const to of REGIONS[region].adjacent) {
        if (isLocked(state, to, seat)) continue;
        const last = lowestOccupied(state.board[to]);
        if (last === -1 || !isOpponentCube(state, clan, state.board[to][last])) continue;
        out.push(withAs({ type: "balance-replace", region, square, to }, as));
      }
    });
  });
  return out;
}

export function determinationActions(
  state: GameState,
  clan: Clan,
  seat: number,
  as?: Clan,
): RewardAction[] {
  if (state.supply[clan] <= 0) return [];
  const out: RewardAction[] = [];
  state.board.forEach((squares, region) => {
    if (isLocked(state, region, seat)) return;
    if (highestEmpty(squares) === -1) return;
    out.push(withAs({ type: "determination", region }, as));
  });
  return out;
}

export function aggressionActions(
  state: GameState,
  clan: Clan,
  seat: number,
  as?: Clan,
): RewardAction[] {
  const out: RewardAction[] = [];
  state.board.forEach((squares, region) => {
    if (isLocked(state, region, seat)) return;
    squares.forEach((cube, square) => {
      if (isOpponentCube(state, clan, cube)) {
        out.push(withAs({ type: "aggression", region, square }, as));
      }
    });
  });
  return out;
}

function actionsOfKind(
  state: GameState,
  kind: RewardKind,
  clan: Clan,
  seat: number,
  as?: Clan,
): RewardAction[] {
  switch (kind) {
    case "balance":
      return [
        ...balanceSwapActions(state, clan, seat, as),
        ...balanceMoveActions(state, clan, seat, as),
        ...balanceReplaceActions(state, clan, seat, as),
      ];
    case "determination":
      return determinationActions(state, clan, seat, as);
    case "aggression":
      return aggressionActions(state, clan, seat, as);
  }
}

/** Every reward the slot's player may take right now (without the `pass`). */
export function rewardActionsForSlot(state: GameState, slot: RewardSlot): RewardAction[] {
  const player = state.players[slot.player];
  if (!player) return [];
  // The Emperor "can control any Faction cube": it acts AS a seated clan.
  const acting: { clan: Clan; as?: Clan }[] =
    player.clan === null
      ? state.seatedClans.map((clan) => ({ clan, as: clan }))
      : [{ clan: player.clan }];
  const out: RewardAction[] = [];
  for (const kind of kindsAvailable(slot)) {
    for (const { clan, as } of acting)
      out.push(...actionsOfKind(state, kind, clan, slot.player, as));
  }
  return out;
}

export function bonusActionsFor(state: GameState, seat: number): Action[] {
  const player = state.players[seat];
  if (!player || player.clan === null || state.supply[player.clan] <= 0) return [];
  const out: Action[] = [];
  state.board.forEach((squares, region) => {
    if (highestEmpty(squares) !== -1) out.push({ type: "bonus-place", region });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Legal actions — the single source of truth for the spec AND the validator
// ---------------------------------------------------------------------------

export function getLegalActions(state: GameState): Action[] {
  switch (state.phase) {
    case "trick": {
      const player = state.players[state.turn];
      if (!player) return [];
      return legalPlays(player.hand, state.leadSuit).map((card) => ({ type: "play", card }));
    }
    case "rewards": {
      const slot = state.rewardQueue[0];
      if (!slot) return [];
      const actions: Action[] = rewardActionsForSlot(state, slot);
      if (RULINGS.rewardsOptional || actions.length === 0) actions.push({ type: "pass" });
      return actions;
    }
    case "bonus": {
      const seat = state.bonusQueue[0];
      if (seat === undefined) return [];
      const actions = bonusActionsFor(state, seat);
      if (RULINGS.bonusOptional || actions.length === 0) actions.push({ type: "pass" });
      return actions;
    }
    default:
      return [];
  }
}
