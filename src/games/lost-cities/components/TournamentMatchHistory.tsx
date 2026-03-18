import { useCallback, useMemo } from "react";
import { ALL_STRATEGIES } from "../logic/ai-strategies";
import type { TournamentGameLog } from "../logic/tournament-log";
import { loadTournamentGames } from "../logic/tournament-persistence";

interface TournamentMatchHistoryProps {
  strategyAId: string;
  strategyBId: string;
  onBack: () => void;
  onSelectGame: (game: TournamentGameLog) => void;
}

export default function TournamentMatchHistory({
  strategyAId,
  strategyBId,
  onBack,
  onSelectGame,
}: TournamentMatchHistoryProps) {
  const labelA = ALL_STRATEGIES.find((s) => s.id === strategyAId)?.label ?? strategyAId;
  const labelB = ALL_STRATEGIES.find((s) => s.id === strategyBId)?.label ?? strategyBId;

  const games = useMemo(
    () => loadTournamentGames(strategyAId, strategyBId),
    [strategyAId, strategyBId],
  );

  const stats = useMemo(() => {
    let aWins = 0;
    let bWins = 0;
    let draws = 0;
    for (const g of games) {
      if (g.scoreA > g.scoreB) aWins++;
      else if (g.scoreB > g.scoreA) bWins++;
      else draws++;
    }
    return { aWins, bWins, draws };
  }, [games]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([JSON.stringify(games, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tournament-${strategyAId}-vs-${strategyBId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [games, strategyAId, strategyBId]);

  return (
    <div className="flex flex-col items-center gap-6 px-4 py-8 max-w-4xl mx-auto">
      <div className="text-center">
        <h2 className="text-2xl font-extrabold text-white">
          {labelA} vs {labelB}
        </h2>
        <p className="mt-2 text-sm text-gray-400">
          {games.length} games &middot; <span className="text-green-400">{stats.aWins}W</span> /{" "}
          <span className="text-red-400">{stats.bWins}L</span> /{" "}
          <span className="text-gray-400">{stats.draws}D</span> for {labelA}
        </p>
      </div>

      {games.length === 0 ? (
        <p className="text-gray-500 text-sm italic py-12">
          No game logs found for this matchup. Run the tournament first.
        </p>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-xs font-medium uppercase tracking-wider text-gray-500 border-b border-gray-800">
                <th className="p-2.5 text-left">#</th>
                <th className="p-2.5 text-center">First Player</th>
                <th className="p-2.5 text-right">{labelA}</th>
                <th className="p-2.5 text-right">{labelB}</th>
                <th className="p-2.5 text-right">Diff</th>
                <th className="p-2.5 text-center">Winner</th>
              </tr>
            </thead>
            <tbody>
              {games.map((game, i) => {
                const diff = game.scoreA - game.scoreB;
                const aWon = diff > 0;
                const bWon = diff < 0;

                return (
                  <tr
                    // biome-ignore lint/suspicious/noArrayIndexKey: static list / chart data points don't reorder
                    key={i}
                    onClick={() => onSelectGame(game)}
                    className="border-b border-gray-800/40 cursor-pointer transition-colors hover:bg-gray-800/50"
                  >
                    <td className="p-2.5 text-gray-400 tabular-nums">{i + 1}</td>
                    <td className="p-2.5 text-center text-gray-400 text-xs">
                      {game.aPlaysFirst ? labelA : labelB}
                    </td>
                    <td
                      className={`p-2.5 text-right tabular-nums font-semibold ${
                        aWon ? "text-green-400" : bWon ? "text-red-400" : "text-gray-400"
                      }`}
                    >
                      {game.scoreA}
                    </td>
                    <td
                      className={`p-2.5 text-right tabular-nums font-semibold ${
                        bWon ? "text-green-400" : aWon ? "text-red-400" : "text-gray-400"
                      }`}
                    >
                      {game.scoreB}
                    </td>
                    <td className="p-2.5 text-right tabular-nums text-gray-500">
                      {diff > 0 ? "+" : ""}
                      {diff}
                    </td>
                    <td className="p-2.5 text-center text-xs">
                      {aWon ? (
                        <span className="text-green-400">{labelA}</span>
                      ) : bWon ? (
                        <span className="text-red-400">{labelB}</span>
                      ) : (
                        <span className="text-gray-500">Draw</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-4 mt-2">
        {games.length > 0 && (
          <button
            type="button"
            onClick={handleDownload}
            className="rounded-lg border border-gray-700 px-5 py-2.5 text-sm font-semibold text-gray-400 transition hover:border-indigo-500 hover:text-indigo-400"
          >
            Download All Logs
          </button>
        )}
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          Back to Tournament
        </button>
      </div>
    </div>
  );
}
