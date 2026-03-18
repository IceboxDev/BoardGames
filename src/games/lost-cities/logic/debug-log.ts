import type { ActionLogEntry, AIEngine, Card, GameLog, PlayerScore } from "./types";

export function buildGameLog(opts: {
  aiEngine: AIEngine;
  initialDeal: { playerHand: Card[]; aiHand: Card[]; drawPile: Card[] };
  actions: ActionLogEntry[];
  finalScores: { player: PlayerScore; ai: PlayerScore } | null;
}): GameLog {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    aiEngine: opts.aiEngine,
    initialDeal: opts.initialDeal,
    actions: opts.actions,
    finalScores: opts.finalScores,
  };
}

export function downloadGameLog(log: GameLog): void {
  const json = JSON.stringify(log, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const date = new Date(log.timestamp);
  const ts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");

  const a = document.createElement("a");
  a.href = url;
  a.download = `lost-cities-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
