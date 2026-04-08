import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "../../lib/api-client";

interface TournamentMatchHistoryProps {
  strategies: { id: string; label: string }[];
  strategyAId: string;
  strategyBId: string;
  tournamentId: string;
  onBack: () => void;
  onSelectGame?: (game: unknown) => void;
  exportLogFn?: (game: unknown) => unknown;
}

interface GameRecord {
  scoreA: number;
  scoreB: number;
  aPlaysFirst?: boolean;
  gameIndex?: number;
}

export default function TournamentMatchHistory({
  strategies,
  strategyAId,
  strategyBId,
  tournamentId,
  onBack,
  onSelectGame,
  exportLogFn,
}: TournamentMatchHistoryProps) {
  const labelA = strategies.find((s) => s.id === strategyAId)?.label ?? strategyAId;
  const labelB = strategies.find((s) => s.id === strategyBId)?.label ?? strategyBId;

  const [games, setGames] = useState<GameRecord[]>([]);
  const [rawGames, setRawGames] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiClient
      .getTournamentGames(tournamentId)
      .then((logs) => {
        setRawGames(logs);
        setGames(
          logs.map((g) => {
            const rec = g as Record<string, unknown>;
            return {
              scoreA: (rec.scoreA as number) ?? 0,
              scoreB: (rec.scoreB as number) ?? 0,
              aPlaysFirst: rec.aPlaysFirst as boolean | undefined,
              gameIndex: rec.gameIndex as number | undefined,
            };
          }),
        );
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [tournamentId]);

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

  const handleDownload = useCallback(async () => {
    if (!exportLogFn) return;
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    for (let i = 0; i < rawGames.length; i++) {
      const game = rawGames[i];
      const human = exportLogFn(game);
      const n = (games[i]?.gameIndex ?? i) + 1;
      const name = `game-${String(n).padStart(3, "0")}.json`;
      zip.file(name, JSON.stringify(human, null, 2));
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tournament-${strategyAId}-vs-${strategyBId}-logs.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rawGames, games, exportLogFn, strategyAId, strategyBId]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 py-8">
      <div className="text-center">
        <h2 className="text-2xl font-extrabold text-white">
          {labelA} vs {labelB}
        </h2>
        <p className="mt-2 text-sm text-gray-400">
          {loading ? (
            "Loading..."
          ) : (
            <>
              {games.length} games &middot; <span className="text-green-400">{stats.aWins}W</span> /{" "}
              <span className="text-red-400">{stats.bWins}L</span> /{" "}
              <span className="text-gray-400">{stats.draws}D</span> for {labelA}
            </>
          )}
        </p>
      </div>

      {!loading && games.length === 0 ? (
        <p className="py-12 text-sm italic text-gray-500">
          No game logs found for this matchup. Run the tournament first.
        </p>
      ) : !loading ? (
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs font-medium uppercase tracking-wider text-gray-500">
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
                    // biome-ignore lint/suspicious/noArrayIndexKey: static tournament game list
                    key={i}
                    onClick={() => onSelectGame?.(rawGames[i])}
                    className={`border-b border-gray-800/40 transition-colors ${
                      onSelectGame ? "cursor-pointer hover:bg-gray-800/50" : ""
                    }`}
                  >
                    <td className="p-2.5 tabular-nums text-gray-400">{i + 1}</td>
                    <td className="p-2.5 text-center text-xs text-gray-400">
                      {game.aPlaysFirst != null ? (game.aPlaysFirst ? labelA : labelB) : "—"}
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
      ) : null}

      <div className="mt-2 flex gap-4">
        {exportLogFn && rawGames.length > 0 && (
          <button
            type="button"
            onClick={handleDownload}
            className="rounded-lg border border-gray-700 px-5 py-2.5 text-sm font-semibold text-gray-400 transition hover:border-indigo-500 hover:text-indigo-400"
          >
            Download all logs (ZIP)
          </button>
        )}
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-gray-500 transition-colors hover:text-gray-300"
        >
          Back to Tournament
        </button>
      </div>
    </div>
  );
}
