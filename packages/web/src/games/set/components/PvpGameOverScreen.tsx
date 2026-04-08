import { formatTime } from "@boardgames/core/games/set/metrics";
import type { PvpGameResult, PvpPlayerRecordEntry } from "@boardgames/core/games/set/pvp-types";
import { GameOverLayout } from "../../../components/game-over";

interface PvpGameOverScreenProps {
  result: PvpGameResult;
  playerIndex: number;
  opponentName: string;
  onBackToMenu: () => void;
}

export default function PvpGameOverScreen({
  result,
  playerIndex,
  opponentName,
  onBackToMenu,
}: PvpGameOverScreenProps) {
  const myStats = result.players[playerIndex];
  const oppStats = result.players[1 - playerIndex];

  const iWon = result.winner === playerIndex;
  const isDraw = result.winner === "draw";

  return (
    <GameOverLayout
      headline={isDraw ? "Draw!" : iWon ? "You Win!" : "You Lose!"}
      headlineColor={isDraw ? "draw" : iWon ? "win" : "lose"}
      subtitle={formatTime(result.durationMs)}
      actions={[{ label: "Back to Menu", variant: "primary", onClick: onBackToMenu }]}
    >
      {/* Side-by-side comparison */}
      <div className="grid grid-cols-2 gap-4">
        <PlayerColumn label="You" stats={myStats} highlight={iWon} />
        <PlayerColumn label={opponentName} stats={oppStats} highlight={!isDraw && !iWon} />
      </div>
    </GameOverLayout>
  );
}

function PlayerColumn({
  label,
  stats,
  highlight,
}: {
  label: string;
  stats: PvpPlayerRecordEntry;
  highlight: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-4 ${
        highlight ? "bg-green-900/20 border border-green-500/30" : "bg-surface-800"
      }`}
    >
      <p className="text-sm font-semibold text-gray-400 mb-3">{label}</p>
      <div className="space-y-2">
        <Stat label="SETs Found" value={String(stats.setsFound)} />
        <Stat label="Penalties" value={String(stats.penalties)} />
        <Stat
          label="Net Score"
          value={String(stats.netScore)}
          bold
          color={stats.netScore > 0 ? "text-green-400" : "text-white"}
        />
        {stats.avgFindTimeMs > 0 && (
          <Stat label="Avg Find Time" value={formatTime(stats.avgFindTimeMs)} />
        )}
        {stats.fastestSetMs > 0 && (
          <Stat label="Fastest SET" value={formatTime(stats.fastestSetMs)} />
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  bold,
  color = "text-white",
}: {
  label: string;
  value: string;
  bold?: boolean;
  color?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm tabular-nums ${color} ${bold ? "font-bold" : "font-medium"}`}>
        {value}
      </span>
    </div>
  );
}
