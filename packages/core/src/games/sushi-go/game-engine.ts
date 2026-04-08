import { createDeck, dealHands, shuffleDeck } from "./deck";
import { scorePuddings, scoreRoundDetailed } from "./scoring";
import type {
  ActionLogEntry,
  Card,
  GameState,
  PlayerState,
  RevealedCards,
  Selection,
} from "./types";
import { HAND_SIZES, isNigiri } from "./types";

// ── State Creation ─────────────────────────────────────────────────────────

export function createInitialState(playerCount: number): GameState {
  const deck = shuffleDeck(createDeck());
  const { hands } = dealHands(deck, playerCount);

  const players: PlayerState[] = hands.map((hand) => ({
    hand,
    tableau: [],
    unusedWasabi: 0,
    wasabiBoostedNigiriIds: [],
    puddings: 0,
  }));

  return {
    phase: "selecting",
    round: 1,
    turn: 1,
    playerCount,
    players,
    selections: new Array(playerCount).fill(null),
    lastRevealed: [],
    roundScores: [],
    totalScores: new Array(playerCount).fill(0),
    actionLog: [],
  };
}

// ── Apply Selection ────────────────────────────────────────────────────────

export function applySelection(
  state: GameState,
  playerIndex: number,
  selection: Selection,
): GameState {
  const newSelections = [...state.selections];
  newSelections[playerIndex] = selection;
  return { ...state, selections: newSelections, actionLog: state.actionLog };
}

// ── Reveal & Rotate ────────────────────────────────────────────────────────

export function applyRevealAndRotate(state: GameState): GameState {
  const actionLog: ActionLogEntry[] = [...state.actionLog];

  const players = state.players.map((p) => ({
    hand: [...p.hand],
    tableau: [...p.tableau],
    unusedWasabi: p.unusedWasabi,
    wasabiBoostedNigiriIds: [...p.wasabiBoostedNigiriIds],
    puddings: p.puddings,
  }));

  const lastRevealed: RevealedCards[] = [];

  // Process each player's selection
  for (let i = 0; i < state.playerCount; i++) {
    const sel = state.selections[i];
    if (!sel) continue;

    const p = players[i];
    const cards: Card[] = [];
    let returnedChopsticks = false;

    // Remove primary card from hand, add to tableau
    const cardIdx = p.hand.findIndex((c) => c.id === sel.cardId);
    if (cardIdx !== -1) {
      const [card] = p.hand.splice(cardIdx, 1);
      cards.push(card);
      addCardToTableau(p, card);
    }

    // If using chopsticks, remove second card and return chopsticks
    if (sel.secondCardId !== undefined) {
      const secondIdx = p.hand.findIndex((c) => c.id === sel.secondCardId);
      if (secondIdx !== -1) {
        const [card] = p.hand.splice(secondIdx, 1);
        cards.push(card);
        addCardToTableau(p, card);
      }

      // Return chopsticks from tableau to hand
      const chopIdx = p.tableau.findIndex((c) => c.type === "chopsticks");
      if (chopIdx !== -1) {
        const [chop] = p.tableau.splice(chopIdx, 1);
        p.hand.push(chop);
        returnedChopsticks = true;
      }
    }

    lastRevealed.push({ playerIndex: i, cards, returnedChopsticks });

    // Log reveal entry
    actionLog.push({
      round: state.round,
      turn: state.turn,
      playerIndex: i,
      action: "reveal",
      cards,
      usedChopsticks: returnedChopsticks,
    });
  }

  const handSize = HAND_SIZES[state.playerCount];
  const isLastTurn = state.turn >= handSize;

  if (isLastTurn) {
    return endRound(state, players, lastRevealed, actionLog);
  }

  // Rotate hands left: player i gets player (i+1)%N's hand
  const rotatedHands = players.map((_, i) => players[(i + 1) % state.playerCount].hand);
  for (let i = 0; i < state.playerCount; i++) {
    players[i].hand = rotatedHands[i];
  }

  return {
    ...state,
    phase: "selecting",
    turn: state.turn + 1,
    players,
    selections: new Array(state.playerCount).fill(null),
    lastRevealed,
    actionLog,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function addCardToTableau(player: PlayerState, card: Card): void {
  player.tableau.push(card);

  if (card.type === "wasabi") {
    player.unusedWasabi++;
  } else if (isNigiri(card.type) && player.unusedWasabi > 0) {
    player.unusedWasabi--;
    player.wasabiBoostedNigiriIds.push(card.id);
  }
}

function endRound(
  state: GameState,
  players: PlayerState[],
  lastRevealed: RevealedCards[],
  actionLog: ActionLogEntry[],
): GameState {
  // Detailed scoring BEFORE counting puddings
  const detailed = scoreRoundDetailed(players);
  const roundScore = detailed.playerScores.map((s) => s.total);

  // Count puddings from this round's tableau
  for (const p of players) {
    p.puddings += p.tableau.filter((c) => c.type === "pudding").length;
  }

  const roundScores = [...state.roundScores, roundScore];
  const totalScores = state.totalScores.map((s, i) => s + roundScore[i]);

  // Log round-end with detailed breakdown
  actionLog.push({
    round: state.round,
    turn: state.turn,
    playerIndex: 0,
    action: "round-end",
    scores: roundScore,
    categoryScores: detailed.playerScores,
    roundSnapshots: detailed.snapshots,
    makiTotals: detailed.makiTotals,
  });

  if (state.round >= 3) {
    // Final round — add pudding scoring
    const puddingScores = scorePuddings(players, state.playerCount);
    for (let i = 0; i < state.playerCount; i++) {
      totalScores[i] += puddingScores[i];
    }

    // Log game-end
    actionLog.push({
      round: state.round,
      turn: state.turn,
      playerIndex: 0,
      action: "game-end",
      scores: totalScores,
      puddingScores,
    });

    return {
      ...state,
      phase: "game-over",
      players,
      selections: new Array(state.playerCount).fill(null),
      lastRevealed,
      roundScores,
      totalScores,
      actionLog,
    };
  }

  // Start new round — fresh deck, clear tableaux
  const deck = shuffleDeck(createDeck());
  const { hands } = dealHands(deck, state.playerCount);

  const newPlayers: PlayerState[] = players.map((p, i) => ({
    hand: hands[i],
    tableau: [],
    unusedWasabi: 0,
    wasabiBoostedNigiriIds: [],
    puddings: p.puddings,
  }));

  return {
    ...state,
    phase: "selecting",
    round: state.round + 1,
    turn: 1,
    players: newPlayers,
    selections: new Array(state.playerCount).fill(null),
    lastRevealed,
    roundScores,
    totalScores,
    actionLog,
  };
}
