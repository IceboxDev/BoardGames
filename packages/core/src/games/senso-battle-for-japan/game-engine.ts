import { shuffle } from "../../lib/rng";
import { matchLegalAction } from "../../machines/action-validation";
import {
  initialSupply,
  lowestOccupied,
  placeCube,
  removeCube,
  replaceCube,
  setupBoard,
} from "./board";
import { deal, isNinja, rowRng, setupRng, sortHand, suitOf } from "./deck";
import { cardsPerRound } from "./map";
import { affectedRegionsOf, getLegalActions, tierFor, trickWinner } from "./rules";
import { buildResult } from "./scoring";
import type {
  Action,
  AIStrategyId,
  CardId,
  Clan,
  CubeEffect,
  GameState,
  LogEntry,
  Player,
  RewardAction,
  RewardSlot,
} from "./types";
import { CLANS, MAX_PLAYERS, MIN_PLAYERS, ROUNDS, rewardKindOf } from "./types";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export interface CreateOptions {
  /** Disable the public log (tournament runs). */
  log?: boolean;
}

export function createInitialState(
  playerCount: number,
  strategies: readonly (AIStrategyId | null)[],
  seed: number,
  options: CreateOptions = {},
): GameState {
  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new Error(`Sensō needs ${MIN_PLAYERS}–${MAX_PLAYERS} players, got ${playerCount}`);
  }
  if (strategies.length !== playerCount) {
    throw new Error(`Expected ${playerCount} seat strategies, got ${strategies.length}`);
  }

  const rng = setupRng(seed);
  const factions: (Clan | null)[] =
    playerCount === 5
      ? shuffle([...CLANS, null], rng)
      : shuffle([...CLANS], rng).slice(0, playerCount);

  const players: Player[] = factions.map((clan, index) => ({
    index,
    type: strategies[index] === null ? "human" : "ai",
    aiStrategy: strategies[index] ?? undefined,
    clan,
    hand: [],
    tricksWon: 0,
  }));
  const seatedClans = factions.filter((c): c is Clan => c !== null);
  const board = setupBoard();

  const state: GameState = {
    phase: "trick",
    seed,
    players,
    emperorSeat: factions.indexOf(null) === -1 ? null : factions.indexOf(null),
    seatedClans,
    board,
    supply: initialSupply(seatedClans, board),
    round: 0,
    firstPlayer: 0,
    advantageRow: shuffle([...CLANS], rowRng(seed, 1)),
    trumpSuit: "takeda",
    trickNumber: 1,
    leader: 0,
    turn: 0,
    table: [],
    leadSuit: null,
    played: [],
    tricks: [],
    completedTrick: null,
    lastTrick: null,
    rewardQueue: [],
    affected: [],
    bonusQueue: [],
    logEnabled: options.log ?? true,
    log: [],
    result: null,
  };
  pushLog(state, { kind: "advantage-row", half: 1, row: [...state.advantageRow] });
  startRound(state, 1);
  return state;
}

function pushLog(state: GameState, entry: LogEntry): void {
  if (state.logEnabled) state.log.push(entry);
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

export function startRound(state: GameState, round: number): void {
  const n = state.players.length;
  state.round = round;
  if (round > 1) state.firstPlayer = (state.firstPlayer + 1) % n;
  if (round === 5) {
    // "Shuffle the Faction Advantage cards and deal a new row of 4" — only now,
    // so nothing about rounds 5–8 exists in state before this point.
    state.advantageRow = shuffle([...CLANS], rowRng(state.seed, 2));
    pushLog(state, { kind: "advantage-row", half: 2, row: [...state.advantageRow] });
  }
  state.trumpSuit = state.advantageRow[(round - 1) % 4];

  const hands = deal(state.seed, round, n);
  state.players.forEach((p, i) => {
    p.hand = sortHand(hands[i], state.trumpSuit);
    p.tricksWon = 0;
  });
  state.trickNumber = 1;
  state.leader = state.firstPlayer;
  state.turn = state.firstPlayer;
  state.table = [];
  state.leadSuit = null;
  state.played = [];
  state.tricks = [];
  state.completedTrick = null;
  state.lastTrick = null;
  state.rewardQueue = [];
  state.affected = [];
  state.bonusQueue = [];
  state.phase = "trick";
  pushLog(state, {
    kind: "round-start",
    round,
    trump: state.trumpSuit,
    firstPlayer: state.firstPlayer,
    cardsEach: cardsPerRound(n, round),
  });
}

// ---------------------------------------------------------------------------
// Apply (mutating) + pure wrappers
// ---------------------------------------------------------------------------

export function applyActionPure(state: GameState, action: Action): GameState {
  const next = structuredClone(state);
  applyAction(next, action);
  return next;
}

export function settleTrickPure(state: GameState): GameState {
  const next = structuredClone(state);
  settleTrick(next);
  return next;
}

/** Apply a player action. Throws on anything the engine does not enumerate as legal. */
export function applyAction(state: GameState, action: Action): void {
  const match = matchLegalAction(getLegalActions(state), action);
  if (!match) {
    throw new Error(`Illegal action ${JSON.stringify(action)} in phase "${state.phase}"`);
  }
  applyActionTrusted(state, match);
}

/**
 * Apply an action WITHOUT re-enumerating legality. Only for callers that hold
 * one of `getLegalActions`' own objects (the AI search, which applies hundreds
 * of candidates per decision); everything reachable from the network goes
 * through `applyAction`.
 */
export function applyActionTrusted(state: GameState, match: Action): void {
  switch (state.phase) {
    case "trick":
      if (match.type !== "play") throw new Error("Only a play is legal during a trick");
      applyPlay(state, match.card);
      return;
    case "rewards":
      if (match.type === "pass") applyRewardPass(state);
      else if (match.type === "play" || match.type === "bonus-place") {
        throw new Error("Not a reward action");
      } else applyReward(state, match);
      return;
    case "bonus":
      if (match.type === "pass") applyBonusPass(state);
      else if (match.type === "bonus-place") applyBonus(state, match.region);
      else throw new Error("Not a bonus action");
      return;
    default:
      throw new Error(`No player actions in phase "${state.phase}"`);
  }
}

// ---------------------------------------------------------------------------
// Trick phase
// ---------------------------------------------------------------------------

function applyPlay(state: GameState, card: CardId): void {
  const n = state.players.length;
  const seat = state.turn;
  const player = state.players[seat];
  player.hand = player.hand.filter((c) => c !== card);
  state.table.push({ seat, card });
  state.played.push(card);
  if (state.table.length === 1) state.leadSuit = isNinja(card) ? null : suitOf(card);

  if (state.table.length === n) {
    const winner = trickWinner(state.table, state.trumpSuit, state.leadSuit);
    state.completedTrick = {
      round: state.round,
      trick: state.trickNumber,
      plays: state.table.map((p) => ({ ...p })),
      winner,
    };
    pushLog(state, {
      kind: "trick-won",
      round: state.round,
      trick: state.trickNumber,
      winner,
      plays: state.completedTrick.plays.map((p) => ({ ...p })),
    });
    state.phase = "trick-settle";
  } else {
    state.turn = (seat + 1) % n;
  }
}

/** Engine step after the settle beat: bank the trick and continue the round. */
export function settleTrick(state: GameState): void {
  const trick = state.completedTrick;
  if (state.phase !== "trick-settle" || !trick) throw new Error("No trick to settle");
  state.players[trick.winner].tricksWon += 1;
  state.tricks.push(trick);
  state.lastTrick = trick;
  state.completedTrick = null;
  state.table = [];
  state.leadSuit = null;

  if (state.players[0].hand.length === 0) {
    state.rewardQueue = buildRewardQueue(state);
    state.affected = [];
    if (state.rewardQueue.length === 0) endRewardsPhase(state);
    else state.phase = "rewards";
    return;
  }
  state.trickNumber += 1;
  state.leader = trick.winner;
  state.turn = trick.winner;
  state.phase = "trick";
}

// ---------------------------------------------------------------------------
// Conflict Rewards
// ---------------------------------------------------------------------------

/** Most victories first; ties clockwise starting at the seat left of the First Player. */
export function buildRewardQueue(state: GameState): RewardSlot[] {
  const n = state.players.length;
  const offset = (seat: number) => (seat - state.firstPlayer - 1 + n) % n;
  return state.players
    .filter((p) => p.tricksWon >= 1)
    .sort((a, b) => b.tricksWon - a.tricksWon || offset(a.index) - offset(b.index))
    .map((p) => {
      const tier = tierFor(p.tricksWon);
      if (tier === null) throw new Error("unreachable");
      return { player: p.index, tier, picksLeft: tier === 7 ? 2 : 1, used: [] };
    });
}

function applyReward(state: GameState, action: RewardAction): void {
  const slot = state.rewardQueue[0];
  if (!slot) throw new Error("No reward slot");
  const seat = slot.player;
  const player = state.players[seat];
  const clan = action.as ?? player.clan;
  if (clan === null) throw new Error("The Emperor must name the clan it acts as");
  if (player.clan !== null && action.as !== undefined) {
    throw new Error("Only the Emperor may act as another clan");
  }

  const effects: CubeEffect[] = [];
  const { board } = state;
  switch (action.type) {
    case "balance-swap": {
      const squares = board[action.region];
      const above = squares[action.square - 1];
      if (above === null || above === undefined) throw new Error("Nothing above to swap with");
      squares[action.square - 1] = clan;
      squares[action.square] = above;
      effects.push({
        kind: "swapped",
        clan,
        region: action.region,
        square: action.square,
        toRegion: action.region,
        toSquare: action.square - 1,
      });
      break;
    }
    case "balance-move": {
      removeCube(state, action.region, action.square, { toSupply: false });
      const toSquare = placeCube(state, action.to, clan, { fromSupply: false });
      effects.push({
        kind: "moved",
        clan,
        region: action.region,
        square: action.square,
        toRegion: action.to,
        toSquare,
      });
      break;
    }
    case "balance-replace": {
      const last = lowestOccupied(board[action.to]);
      const victim = replaceCube(state, action.to, last, clan, { fromSupply: false });
      removeCube(state, action.region, action.square, { toSupply: false });
      effects.push({ kind: "removed", clan: victim, region: action.to, square: last });
      effects.push({
        kind: "moved",
        clan,
        region: action.region,
        square: action.square,
        toRegion: action.to,
        toSquare: last,
      });
      break;
    }
    case "determination": {
      const square = placeCube(state, action.region, clan);
      effects.push({ kind: "placed", clan, region: action.region, square });
      break;
    }
    case "aggression": {
      if (state.supply[clan] > 0) {
        const victim = replaceCube(state, action.region, action.square, clan);
        effects.push({
          kind: "removed",
          clan: victim,
          region: action.region,
          square: action.square,
        });
        effects.push({ kind: "placed", clan, region: action.region, square: action.square });
      } else {
        // "If the player does not have a Faction cube to place ... all Faction
        // cubes within that Region move upwards to fill the gap created."
        const victim = removeCube(state, action.region, action.square);
        effects.push({
          kind: "removed",
          clan: victim,
          region: action.region,
          square: action.square,
        });
      }
      break;
    }
  }

  for (const region of affectedRegionsOf(action)) state.affected.push({ region, by: seat });
  pushLog(state, {
    kind: "reward",
    round: state.round,
    player: seat,
    tier: slot.tier,
    action,
    effects,
  });

  slot.used.push(rewardKindOf(action));
  if (slot.picksLeft === 2) slot.picksLeft = 1;
  else state.rewardQueue.shift();
  if (state.rewardQueue.length === 0) endRewardsPhase(state);
}

function applyRewardPass(state: GameState): void {
  const slot = state.rewardQueue[0];
  if (!slot) throw new Error("No reward slot");
  pushLog(state, { kind: "reward-pass", round: state.round, player: slot.player, tier: slot.tier });
  state.rewardQueue.shift();
  if (state.rewardQueue.length === 0) endRewardsPhase(state);
}

function endRewardsPhase(state: GameState): void {
  state.affected = [];
  state.rewardQueue = [];
  if (state.round === 4) {
    state.bonusQueue = buildBonusQueue(state);
    if (state.bonusQueue.length > 0) {
      state.phase = "bonus";
      return;
    }
  }
  if (state.round >= ROUNDS) finishGame(state);
  else startRound(state, state.round + 1);
}

// ---------------------------------------------------------------------------
// End of the 4th round bonus cube
// ---------------------------------------------------------------------------

/** Clockwise from the seat left of the (round-4) First Player; the Emperor and empty supplies skip. */
export function buildBonusQueue(state: GameState): number[] {
  const n = state.players.length;
  const queue: number[] = [];
  for (let k = 1; k <= n; k++) {
    const seat = (state.firstPlayer + k) % n;
    const clan = state.players[seat].clan;
    if (clan !== null && state.supply[clan] > 0) queue.push(seat);
  }
  return queue;
}

function applyBonus(state: GameState, region: number): void {
  const seat = state.bonusQueue[0];
  if (seat === undefined) throw new Error("No bonus seat");
  const clan = state.players[seat].clan;
  if (clan === null) throw new Error("The Emperor places no bonus cube");
  const square = placeCube(state, region, clan);
  pushLog(state, { kind: "bonus", player: seat, region, square, clan });
  state.bonusQueue.shift();
  if (state.bonusQueue.length === 0) startRound(state, 5);
}

function applyBonusPass(state: GameState): void {
  const seat = state.bonusQueue[0];
  if (seat === undefined) throw new Error("No bonus seat");
  pushLog(state, { kind: "bonus-pass", player: seat });
  state.bonusQueue.shift();
  if (state.bonusQueue.length === 0) startRound(state, 5);
}

// ---------------------------------------------------------------------------
// Game end
// ---------------------------------------------------------------------------

function finishGame(state: GameState): void {
  state.result = buildResult(state);
  pushLog(state, { kind: "game-over", scores: state.result.scores, winner: state.result.winner });
  state.phase = "game-over";
}
