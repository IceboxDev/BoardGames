export type Shape = "diamond" | "oval" | "squiggle";
export type CardColor = "red" | "green" | "purple";
export type Fill = "solid" | "striped" | "empty";
export type Count = 1 | 2 | 3;

export interface SetCardData {
  id: number;
  shape: Shape;
  color: CardColor;
  fill: Fill;
  count: Count;
}

export type GamePhase = "idle" | "dealing" | "playing" | "selecting" | "game-over";

export interface DealEntry {
  slotIndex: number;
  card: SetCardData;
}

export interface PerSetRecord {
  reactionTimeMs: number;
  selectionTimeMs: number;
  totalFindTimeMs: number;
  boardSize: number;
  calledDuringDeal: boolean;
  cardsDealtWhenCalled: number;
}

export interface GameRecord {
  id: string;
  timestamp: number;
  durationMs: number;
  setsFound: number;
  incorrectCalls: number;
  accuracy: number;
  netScore: number;
  avgFindTimeMs: number;
  medianFindTimeMs: number;
  fastestSetMs: number;
  slowestSetMs: number;
  consistencyMs: number;
  timeToFirstSetMs: number;
  earlyCallCount: number;
  earlyCallRate: number;
  avgBoardSize: number;
  plusThreeRequests: number;
  hintCount: number;
  longestStreak: number;
  fatigueSlopeMs: number;
  cardsRemaining: number;
  throughput: number;
  rating: number;
  perSetDetails: PerSetRecord[];
}
