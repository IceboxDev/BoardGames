import { hasBuiltStageEffect, tableauNames } from "./board";
import { getCardDef } from "./cards";
import { getEdificeDef } from "./edifice";
import { solvePayments } from "./payment";
import type { BuildWonderAction, CardId, GameState, Payment, SevenWondersAction } from "./types";
import { cardIdName } from "./types";
import { getWonderDef } from "./wonders";

/** -1 while everyone selects simultaneously; the pending player's index otherwise. */
export function getActivePlayer(state: GameState): number {
  if (state.phase === "pending" && state.pendingQueue.length > 0) {
    return state.pendingQueue[0].playerIndex;
  }
  return -1;
}

type BuildAction =
  | { type: "play-card"; cardId: CardId; payment: Payment }
  | BuildWonderAction
  | { type: "discard"; cardId: CardId };

/** Every way `playerIndex` could resolve one card: play (chain/pay/free), wonder stage, discard. */
function buildActionsForCard(state: GameState, playerIndex: number, cardId: CardId): BuildAction[] {
  const player = state.players[playerIndex];
  const def = getCardDef(cardIdName(cardId));
  const names = tableauNames(player);
  const actions: BuildAction[] = [{ type: "discard", cardId }];

  // Play the card (never a duplicate name).
  if (!names.has(def.name)) {
    const chain = def.chainFrom?.some((from) => names.has(from)) ?? false;
    if (chain) {
      actions.push({ type: "play-card", cardId, payment: { kind: "chain" } });
    } else {
      const payments = solvePayments(state, playerIndex, def.cost);
      for (const payment of payments ?? []) {
        actions.push({ type: "play-card", cardId, payment });
      }
      if (hasBuiltStageEffect(player, "free-build-per-age") && !player.freeBuildUsedThisAge) {
        actions.push({ type: "play-card", cardId, payment: { kind: "free-build" } });
      }
    }
  }

  // Bury the card to build the next wonder stage (chains/free builds don't apply).
  const side = getWonderDef(player.wonderId).sides[player.side];
  if (player.stagesBuilt < side.stages.length) {
    const stageCost = side.stages[player.stagesBuilt].cost;
    const payments = solvePayments(state, playerIndex, stageCost);

    // Edifice: may also participate in the current Age's project when it's an
    // open project, this player hasn't joined it yet, and they can afford the
    // stage payment plus the participation coin cost.
    const edifice = state.edifices?.[state.age - 1];
    const canParticipate =
      edifice !== undefined &&
      edifice.status === "project" &&
      !edifice.participants.includes(playerIndex);
    const participationCost = canParticipate ? getEdificeDef(edifice.card).cost : 0;

    const stageCoinCost = stageCost.coins ?? 0;
    for (const payment of payments ?? []) {
      if (payment.kind !== "resources") continue;
      actions.push({ type: "build-wonder", cardId, payment });
      const coinsLeft = player.coins - payment.left - payment.right - stageCoinCost;
      if (canParticipate && coinsLeft >= participationCost) {
        actions.push({ type: "build-wonder", cardId, payment, participate: true });
      }
    }
  }

  return actions;
}

export function getLegalActions(state: GameState, playerIndex: number): SevenWondersAction[] {
  if (state.phase === "selecting") {
    if (state.selections[playerIndex] !== null) return [];
    return state.hands[playerIndex].flatMap((cardId) =>
      buildActionsForCard(state, playerIndex, cardId),
    );
  }

  if (state.phase === "pending" && state.pendingQueue[0]?.playerIndex === playerIndex) {
    const pending = state.pendingQueue[0];
    if (pending.kind === "halikarnassos") {
      const names = tableauNames(state.players[playerIndex]);
      const actions: SevenWondersAction[] = [{ type: "skip-pending" }];
      const seen = new Set<string>();
      for (const cardId of state.discard) {
        const name = cardIdName(cardId);
        if (names.has(name) || seen.has(name)) continue;
        seen.add(name);
        actions.push({ type: "pick-discard", cardId });
      }
      return actions;
    }
    // babylon-seventh: resolve the leftover card like a normal turn.
    const leftover = state.hands[playerIndex][0];
    if (leftover === undefined) return [{ type: "skip-pending" }];
    return buildActionsForCard(state, playerIndex, leftover).map((action) => ({
      type: "play-seventh",
      action,
    }));
  }

  return [];
}
