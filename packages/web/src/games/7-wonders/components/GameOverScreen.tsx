import type { SevenWondersResult } from "@boardgames/core/games/7-wonders/machine";
import { GameOverLayout } from "../../../components/game-over";

const CATEGORIES = [
  { key: "military", label: "⚔️ Military" },
  { key: "coins", label: "🪙 Treasury" },
  { key: "wonder", label: "🏗️ Wonder" },
  { key: "civilian", label: "🏛️ Civilian" },
  { key: "commercial", label: "🏺 Commercial" },
  { key: "guilds", label: "👥 Guilds" },
  { key: "science", label: "⚙️ Science" },
  { key: "edifice", label: "🏛 Edifice" },
] as const;

interface GameOverScreenProps {
  result: SevenWondersResult;
  myIndex: number;
  onMenu: () => void;
  onPlayAgain?: () => void;
}

export default function GameOverScreen({
  result,
  myIndex,
  onMenu,
  onPlayAgain,
}: GameOverScreenProps) {
  const iWon = result.winner === myIndex;
  const playerCount = result.totals.length;
  const columns = Array.from({ length: playerCount }, (_, i) => ({
    seat: i,
    label: i === myIndex ? "You" : `P${i + 1}`,
  }));
  // Hide the Edifice row entirely in a base game (all zero).
  const categories = CATEGORIES.filter(
    (c) => c.key !== "edifice" || result.breakdowns.some((b) => b.edifice !== 0),
  );

  return (
    <GameOverLayout
      emoji={iWon ? "🏆" : "🏛️"}
      headline={iWon ? "You Win!" : `Player ${result.winner + 1} Wins`}
      headlineColor={iWon ? "win" : "neutral"}
      subtitle={`${result.totals[result.winner]} points`}
      actions={[
        ...(onPlayAgain
          ? [{ label: "Play Again", onClick: onPlayAgain, variant: "primary" as const }]
          : []),
        { label: "Back to Menu", onClick: onMenu, variant: "secondary" as const },
      ]}
    >
      <div className="overflow-x-auto">
        <table className="mx-auto text-sm">
          <thead>
            <tr className="text-fg-secondary">
              <th className="px-3 py-1 text-left font-medium">Category</th>
              {columns.map((col) => (
                <th
                  key={col.label}
                  className={`px-3 py-1 text-right font-medium ${
                    col.seat === result.winner ? "text-amber-300" : ""
                  }`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map(({ key, label }) => (
              <tr key={key} className="border-t border-white/5 text-fg-primary">
                <td className="px-3 py-1 text-left text-fg-secondary">{label}</td>
                {columns.map((col) => (
                  <td key={col.label} className="px-3 py-1 text-right tabular-nums">
                    {result.breakdowns[col.seat][key]}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-white/20 font-bold text-fg-primary">
              <td className="px-3 py-1 text-left">Total</td>
              {columns.map((col) => (
                <td
                  key={col.label}
                  className={`px-3 py-1 text-right tabular-nums ${
                    col.seat === result.winner ? "text-amber-300" : ""
                  }`}
                >
                  {result.totals[col.seat]}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </GameOverLayout>
  );
}
