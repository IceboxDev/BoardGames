import type { PerSetRecord } from "./types";

export type PlayerId = 0 | 1;

export interface PvpPlayerState {
  score: number;
  penalties: number;
  perSetRecords: PerSetRecord[];
  streakEvents: boolean[];
}

export interface PvpPlayerRecordEntry {
  setsFound: number;
  penalties: number;
  netScore: number;
  avgFindTimeMs: number;
  fastestSetMs: number;
  perSetDetails: PerSetRecord[];
}

export interface PvpGameResult {
  players: [PvpPlayerRecordEntry, PvpPlayerRecordEntry];
  winner: 0 | 1 | "draw";
  durationMs: number;
  scoreA: number;
  scoreB: number;
}
