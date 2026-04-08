import type { SushiGoResult } from "@boardgames/core/games/sushi-go/machine";
import type { ActionLogEntry } from "@boardgames/core/games/sushi-go/types";
import { useState } from "react";
import { GameOverLayout } from "../../../components/game-over";

interface GameOverScreenProps {
  result: SushiGoResult;
  myIndex: number;
  actionLog: ActionLogEntry[];
  onMenu: () => void;
  onPlayAgain?: () => void;
}

const CATEGORIES = [
  { key: "maki" as const, emoji: "🍣", label: "Maki Rolls" },
  { key: "tempura" as const, emoji: "🍤", label: "Tempura" },
  { key: "sashimi" as const, emoji: "🐟", label: "Sashimi" },
  { key: "dumpling" as const, emoji: "🥟", label: "Dumpling" },
  { key: "nigiri" as const, emoji: "🍱", label: "Nigiri" },
];

function pName(i: number, my: number): string {
  return i === my ? "You" : `P${i + 1}`;
}

function rowCls(playerIdx: number, myIndex: number, hoveredPlayer: number | null): string {
  const isYou = playerIdx === myIndex;
  const isHovered = hoveredPlayer === playerIdx;
  if (isHovered) return "bg-orange-500/15 text-orange-200 font-semibold";
  if (isYou) return "font-semibold text-orange-300";
  return "text-gray-300";
}

export default function GameOverScreen({
  result,
  myIndex,
  actionLog,
  onMenu,
  onPlayAgain,
}: GameOverScreenProps) {
  const isWinner = result.winner === myIndex;
  const maxScore = Math.max(...result.totalScores);
  const [hoveredPlayer, setHoveredPlayer] = useState<number | null>(null);

  const roundEntries = actionLog.filter((e) => e.action === "round-end");
  const gameEndEntry = actionLog.find((e) => e.action === "game-end");
  const puddingScores = gameEndEntry?.puddingScores;
  const playerCount = result.totalScores.length;

  const roundTotals: number[][] = roundEntries.map((e) => e.scores ?? []);

  // Sorted player indices by total score (descending)
  const sortedByTotal = result.totalScores
    .map((total, i) => ({ total, i }))
    .sort((a, b) => b.total - a.total)
    .map((x) => x.i);

  const actions: Array<{ label: string; variant: "primary" | "secondary"; onClick: () => void }> =
    [];
  if (onPlayAgain) {
    actions.push({ label: "Play Again", variant: "primary", onClick: onPlayAgain });
  }
  actions.push({
    label: "Menu",
    variant: onPlayAgain ? "secondary" : "primary",
    onClick: onMenu,
  });

  return (
    <GameOverLayout
      emoji="🏆"
      headline={isWinner ? "You Win!" : `P${result.winner + 1} Wins!`}
      headlineColor={isWinner ? "win" : "neutral"}
      subtitle={`${maxScore} pts`}
      actions={actions}
    >
      <div className="space-y-8">
        {/* Standings table */}
        <div className="rounded-xl border border-gray-700/50 bg-surface-800 p-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500">
                <th className="pb-3 text-left font-medium">#</th>
                <th className="pb-3 text-left font-medium">Player</th>
                {roundTotals.map((_, r) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static 3 rounds
                  <th key={r} className="pb-3 text-center font-medium">
                    R{r + 1}
                  </th>
                ))}
                {puddingScores && (
                  <th className="pb-3 text-center font-medium" title="Pudding">
                    <span className="cursor-help">🍮</span>
                  </th>
                )}
                <th className="pb-3 text-right font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {sortedByTotal.map((i, rank) => {
                const total = result.totalScores[i];
                return (
                  <tr
                    key={pName(i, myIndex)}
                    className={`transition-colors ${rowCls(i, myIndex, hoveredPlayer)}`}
                    onMouseEnter={() => setHoveredPlayer(i)}
                    onMouseLeave={() => setHoveredPlayer(null)}
                  >
                    <td className="py-1.5 text-gray-500">{rank + 1}</td>
                    <td className="py-1.5">
                      {pName(i, myIndex)}
                      {i === result.winner ? " 👑" : ""}
                    </td>
                    {roundTotals.map((rt, r) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: static 3 rounds
                      <td key={r} className="py-1.5 text-center tabular-nums">
                        {rt[i] ?? 0}
                      </td>
                    ))}
                    {puddingScores && (
                      <td
                        className={`py-1.5 text-center tabular-nums ${
                          puddingScores[i] < 0
                            ? "text-red-400"
                            : puddingScores[i] > 0
                              ? "text-pink-400"
                              : "opacity-40"
                        }`}
                      >
                        {puddingScores[i] > 0 ? `+${puddingScores[i]}` : puddingScores[i]}
                      </td>
                    )}
                    <td className="py-1.5 text-right font-bold tabular-nums">{total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 3 round category breakdowns */}
        <div className="grid grid-cols-3 gap-4">
          {roundEntries.map((entry) => (
            <RoundDetail
              key={`rd-${entry.round}`}
              entry={entry}
              playerCount={playerCount}
              myIndex={myIndex}
              hoveredPlayer={hoveredPlayer}
              onHoverPlayer={setHoveredPlayer}
            />
          ))}
        </div>
      </div>
    </GameOverLayout>
  );
}

// ── Per-round category detail ─────────────────────────────────────────────

function RoundDetail({
  entry,
  playerCount,
  myIndex,
  hoveredPlayer,
  onHoverPlayer,
}: {
  entry: ActionLogEntry;
  playerCount: number;
  myIndex: number;
  hoveredPlayer: number | null;
  onHoverPlayer: (i: number | null) => void;
}) {
  const cs = entry.categoryScores;
  const scores = entry.scores;
  if (!cs || !scores) return null;

  // Sort by this round's score descending
  const sorted = Array.from({ length: playerCount }, (_, i) => i).sort(
    (a, b) => (scores[b] ?? 0) - (scores[a] ?? 0),
  );

  return (
    <div className="rounded-xl border border-gray-700/50 bg-surface-800 p-5">
      <div className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">
        Round {entry.round}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500">
            <th className="pb-2 text-left font-medium" />
            {CATEGORIES.map((c) => (
              <th key={c.key} className="pb-2 text-center font-medium" title={c.label}>
                <span className="cursor-help">{c.emoji}</span>
              </th>
            ))}
            <th className="pb-2 text-right font-bold">Σ</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((i) => (
            <tr
              key={pName(i, myIndex)}
              className={`transition-colors ${rowCls(i, myIndex, hoveredPlayer)}`}
              onMouseEnter={() => onHoverPlayer(i)}
              onMouseLeave={() => onHoverPlayer(null)}
            >
              <td className="py-1 pr-2">{pName(i, myIndex)}</td>
              {CATEGORIES.map((c) => (
                <td
                  key={c.key}
                  className={`py-1 text-center tabular-nums ${cs[i][c.key] > 0 ? "" : "opacity-25"}`}
                >
                  {cs[i][c.key]}
                </td>
              ))}
              <td className="py-1 text-right font-semibold tabular-nums">{scores[i] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
