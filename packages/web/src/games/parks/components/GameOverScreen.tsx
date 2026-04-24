import type { ParksPlayerView, ParksResult } from "@boardgames/core/games/parks/types";
import { PASSION_LABELS } from "@boardgames/core/games/parks/types";
import { GameOverLayout } from "../../../components/game-over";

interface GameOverScreenProps {
  view: ParksPlayerView;
  result: ParksResult;
  playerIndex: number;
  onPlayAgain: () => void;
  onBackToMenu: () => void;
}

export default function GameOverScreen({
  view,
  result,
  playerIndex,
  onPlayAgain,
  onBackToMenu,
}: GameOverScreenProps) {
  const isWinner = result.winner === playerIndex && !result.isDraw;
  const headline = result.isDraw ? "Draw!" : isWinner ? "You Win!" : "You Lose";
  const headlineColor = result.isDraw ? "draw" : isWinner ? "win" : "lose";

  return (
    <GameOverLayout
      emoji={result.isDraw ? undefined : isWinner ? "\uD83C\uDFC6" : "\uD83C\uDFD5\uFE0F"}
      headline={headline}
      headlineColor={headlineColor}
      subtitle={`Final scores: ${result.scores.join(" vs ")}`}
      actions={[
        { label: "Play Again", variant: "primary", onClick: onPlayAgain },
        { label: "Back to Menu", variant: "secondary", onClick: onBackToMenu },
      ]}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {view.players.map((p, i) => {
          const breakdown = result.breakdowns[i];
          const isMe = i === playerIndex;
          const isVictor = i === result.winner && !result.isDraw;
          return (
            <div
              key={p.index}
              className={`rounded-xl border p-4 ${
                isVictor
                  ? "border-emerald-500/60 bg-emerald-950/30"
                  : "border-stone-700/60 bg-stone-900/40"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className={`text-sm font-bold ${isMe ? "text-cyan-300" : "text-amber-300"}`}>
                  {isMe ? "You" : "Opponent"}
                </h3>
                <span className="text-2xl font-bold text-yellow-400">{breakdown.total}</span>
              </div>
              <div className="mb-2 text-[11px] text-violet-300">
                Passion:{" "}
                <span className="font-semibold">{p.passion ? PASSION_LABELS[p.passion] : "—"}</span>
              </div>
              <div className="space-y-1 text-[11px]">
                <ScoreRow label="Parks" value={breakdown.parks} />
                <ScoreRow label="Photos" value={breakdown.photos} />
                <ScoreRow label="Passion" value={breakdown.passion} />
                <ScoreRow label="Mission bonuses" value={breakdown.bonusPT} />
                <div className="my-1 border-t border-stone-700" />
                <ScoreRow label="Total" value={breakdown.total} bold />
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-stone-400">
                <Stat label="Parks visited" value={p.parks.length} />
                <Stat label="Photos taken" value={p.photoCount} />
                <Stat label="Canteens used" value={p.canteensUsedCount} />
              </div>
            </div>
          );
        })}
      </div>
    </GameOverLayout>
  );
}

function ScoreRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold text-white" : "text-stone-300"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-stone-900/60 p-1 text-center">
      <div className="text-sm font-bold text-white">{value}</div>
      <div className="text-[9px] uppercase">{label}</div>
    </div>
  );
}
