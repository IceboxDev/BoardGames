import type {
  MCTSActionStats,
  MCTSDecisionData,
  ReplayAction,
  ReplayStateSnapshot,
  ReplayStepV2,
  TournamentGameLog,
} from "./tournament-log";
import { cardIdToCard } from "./tournament-log";
import type { ExpeditionColor } from "./types";
import { EXPEDITION_COLORS } from "./types";

/** JSON-friendly card label for human-only exports (no integer card ids). */
export interface HumanCardLabel {
  color: ExpeditionColor;
  /** "Wager" or "2" … "10" */
  name: string;
}

export interface HumanReplayStateSnapshot {
  hands: [HumanCardLabel[], HumanCardLabel[]];
  expeditions: {
    player0: Record<ExpeditionColor, HumanCardLabel[]>;
    player1: Record<ExpeditionColor, HumanCardLabel[]>;
  };
  discardPiles: Record<ExpeditionColor, HumanCardLabel[]>;
  drawPile: HumanCardLabel[];
  scores: [number, number];
}

export interface HumanReplayAction {
  /** The card involved in this half-step (played or drawn). */
  card: HumanCardLabel;
  /** Meaning depends on step.phase */
  detail:
    | "play to expedition"
    | "play to discard"
    | "draw from pile"
    | { drawFromDiscard: ExpeditionColor };
}

export interface HumanMCTSActionStats {
  key: string;
  card?: HumanCardLabel;
  kind: "expedition" | "discard" | "draw pile" | "draw discard";
  discardColor?: ExpeditionColor;
  visits: number;
  meanNormalizedReward?: number;
  winRate?: number;
  chosen: boolean;
}

export interface HumanMCTSDecisionData {
  play?: { actions: HumanMCTSActionStats[] };
  draw?: { actions: HumanMCTSActionStats[] };
}

export interface HumanReplayStep {
  turn: number;
  phase: "play" | "draw";
  player: number;
  state: HumanReplayStateSnapshot;
  action?: HumanReplayAction;
  mcts?: HumanMCTSDecisionData;
}

export interface HumanReadableTournamentGameLog {
  exportKind: "human-readable";
  formatVersion: 2;
  gameIndex: number;
  strategyA: string;
  strategyB: string;
  aPlaysFirst: boolean;
  initialHands: [HumanCardLabel[], HumanCardLabel[]];
  initialDrawPile: HumanCardLabel[];
  steps: HumanReplayStep[];
  scoreA: number;
  scoreB: number;
}

function cardToLabel(id: number): HumanCardLabel {
  const c = cardIdToCard(id);
  return {
    color: c.color,
    name: c.type === "wager" ? "Wager" : String(c.value),
  };
}

function labelsFromIds(ids: number[]): HumanCardLabel[] {
  return ids.map(cardToLabel);
}

function expeditionsToHuman(exp: number[][]): HumanReplayStateSnapshot["expeditions"] {
  const player0 = {} as Record<ExpeditionColor, HumanCardLabel[]>;
  const player1 = {} as Record<ExpeditionColor, HumanCardLabel[]>;
  for (let i = 0; i < EXPEDITION_COLORS.length; i++) {
    const col = EXPEDITION_COLORS[i];
    player0[col] = labelsFromIds(exp[i] ?? []);
    player1[col] = labelsFromIds(exp[i + EXPEDITION_COLORS.length] ?? []);
  }
  return { player0, player1 };
}

function discardsToHuman(piles: number[][]): Record<ExpeditionColor, HumanCardLabel[]> {
  const out = {} as Record<ExpeditionColor, HumanCardLabel[]>;
  for (let i = 0; i < EXPEDITION_COLORS.length; i++) {
    out[EXPEDITION_COLORS[i]] = labelsFromIds(piles[i] ?? []);
  }
  return out;
}

export function snapshotToHuman(snap: ReplayStateSnapshot): HumanReplayStateSnapshot {
  return {
    hands: [labelsFromIds(snap.hands[0]), labelsFromIds(snap.hands[1])],
    expeditions: expeditionsToHuman(snap.expeditions),
    discardPiles: discardsToHuman(snap.discardPiles),
    drawPile: labelsFromIds(snap.drawPile),
    scores: [snap.scores[0], snap.scores[1]],
  };
}

function replayActionToHuman(phase: "play" | "draw", a: ReplayAction): HumanReplayAction {
  const card = cardToLabel(a.cardId);
  if (phase === "play") {
    return {
      card,
      detail: a.kind === 0 ? "play to expedition" : "play to discard",
    };
  }
  return a.kind === 0
    ? { card, detail: "draw from pile" }
    : {
        card,
        detail: { drawFromDiscard: EXPEDITION_COLORS[a.color ?? 0] },
      };
}

function mctsKind(
  phase: "play" | "draw",
  kind: number,
): "expedition" | "discard" | "draw pile" | "draw discard" {
  if (phase === "play") {
    return kind === 0 ? "expedition" : "discard";
  }
  return kind === 0 ? "draw pile" : "draw discard";
}

function mctsActionToHuman(phase: "play" | "draw", a: MCTSActionStats): HumanMCTSActionStats {
  const base: HumanMCTSActionStats = {
    key: a.key,
    kind: mctsKind(phase, a.kind),
    visits: a.visits,
    meanNormalizedReward: a.meanNormalizedReward ?? a.winRate ?? 0,
    chosen: a.chosen,
  };
  if (a.cardId !== undefined) {
    base.card = cardToLabel(a.cardId);
  }
  if (a.color !== undefined && phase === "draw") {
    base.discardColor = EXPEDITION_COLORS[a.color];
  }
  return base;
}

function mctsToHuman(m: MCTSDecisionData): HumanMCTSDecisionData {
  const out: HumanMCTSDecisionData = {};
  if (m.play?.actions) {
    out.play = { actions: m.play.actions.map((x) => mctsActionToHuman("play", x)) };
  }
  if (m.draw?.actions) {
    out.draw = { actions: m.draw.actions.map((x) => mctsActionToHuman("draw", x)) };
  }
  return out;
}

function stepToHuman(step: ReplayStepV2): HumanReplayStep {
  const h: HumanReplayStep = {
    turn: step.turn,
    phase: step.phase,
    player: step.player,
    state: snapshotToHuman(step.state),
  };
  if (step.action) {
    h.action = replayActionToHuman(step.phase, step.action);
  }
  if (step.mcts) {
    h.mcts = mctsToHuman(step.mcts);
  }
  return h;
}

/** Convert a stored tournament log into a human-oriented JSON shape (no raw card id integers). */
export function tournamentGameLogToHumanReadable(
  log: TournamentGameLog,
): HumanReadableTournamentGameLog {
  const s0 = log.steps[0];
  if (!s0) throw new Error("tournamentGameLogToHumanReadable: empty steps");
  return {
    exportKind: "human-readable",
    formatVersion: 2,
    gameIndex: log.gameIndex,
    strategyA: log.strategyA,
    strategyB: log.strategyB,
    aPlaysFirst: log.aPlaysFirst,
    initialHands: [labelsFromIds(s0.state.hands[0]), labelsFromIds(s0.state.hands[1])],
    initialDrawPile: labelsFromIds(s0.state.drawPile),
    steps: log.steps.map(stepToHuman),
    scoreA: log.scoreA,
    scoreB: log.scoreB,
  };
}
