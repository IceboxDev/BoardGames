import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "../../lib/api-client";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { LoadingState } from "../ui/LoadingState";

interface TournamentMatchHistoryProps {
  strategies: { id: string; label: string }[];
  strategyAId: string;
  strategyBId: string;
  tournamentId: string;
  onBack: () => void;
  /**
   * Called with the row's `gameIndex` when the user picks a game. The
   * caller — `<TournamentMatchHistoryRoute>` in production — uses the
   * index to navigate to
   * `/play/:slug/tournament/:a/:b/:t/:gameIndex`, where the replay
   * route fetches the single game log and renders the game's replay
   * component. Keeps this table free of the log payload and lets the
   * replay survive a refresh.
   */
  onSelectGameIndex?: (gameIndex: number) => void;
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
  onSelectGameIndex,
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
        {!loading && (
          <p className="mt-2 text-sm text-fg-secondary">
            {games.length} games &middot; <span className="text-emerald-400">{stats.aWins}W</span> /{" "}
            <span className="text-rose-400">{stats.bWins}L</span> /{" "}
            <span className="text-fg-secondary">{stats.draws}D</span> for {labelA}
          </p>
        )}
      </div>

      {loading ? (
        <LoadingState />
      ) : games.length === 0 ? (
        <EmptyState title="No game logs found" description="Run the tournament first." />
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs font-medium uppercase tracking-wider text-fg-muted">
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
                // Each tournament row carries its own `gameIndex` from the
                // server; we prefer that over the table position so the
                // index in the replay URL points at the exact game even
                // when the table is filtered or partially loaded.
                const idx = game.gameIndex ?? i;

                return (
                  <tr
                    // biome-ignore lint/suspicious/noArrayIndexKey: static tournament game list
                    key={i}
                    onClick={() => onSelectGameIndex?.(idx)}
                    className={`border-b border-white/10 transition-colors ${
                      onSelectGameIndex ? "cursor-pointer hover:bg-surface-800/50" : ""
                    }`}
                  >
                    <td className="p-2.5 tabular-nums text-fg-secondary">{i + 1}</td>
                    <td className="p-2.5 text-center text-xs text-fg-secondary">
                      {game.aPlaysFirst != null ? (game.aPlaysFirst ? labelA : labelB) : "—"}
                    </td>
                    <td
                      className={`p-2.5 text-right tabular-nums font-semibold ${
                        aWon ? "text-emerald-400" : bWon ? "text-rose-400" : "text-fg-secondary"
                      }`}
                    >
                      {game.scoreA}
                    </td>
                    <td
                      className={`p-2.5 text-right tabular-nums font-semibold ${
                        bWon ? "text-emerald-400" : aWon ? "text-rose-400" : "text-fg-secondary"
                      }`}
                    >
                      {game.scoreB}
                    </td>
                    <td className="p-2.5 text-right tabular-nums text-fg-muted">
                      {diff > 0 ? "+" : ""}
                      {diff}
                    </td>
                    <td className="p-2.5 text-center text-xs">
                      {aWon ? (
                        <span className="text-emerald-400">{labelA}</span>
                      ) : bWon ? (
                        <span className="text-rose-400">{labelB}</span>
                      ) : (
                        <span className="text-fg-muted">Draw</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-2 flex gap-4">
        {exportLogFn && rawGames.length > 0 && (
          <Button variant="secondary" size="md" onClick={handleDownload}>
            Download all logs (ZIP)
          </Button>
        )}
        <Button variant="link" onClick={onBack} className="text-sm">
          Back to Tournament
        </Button>
      </div>
    </div>
  );
}
