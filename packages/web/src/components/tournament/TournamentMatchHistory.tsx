import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { apiClient } from "../../lib/api-client";
import { qk } from "../../lib/query-keys";
import {
  formatDiff,
  invertOutcome,
  type MatchColumn,
  type MatchOutcome,
  MatchResultsLayout,
  MatchResultsTable,
  MatchTally,
  ResultText,
  scoreToneClass,
} from "../match-history/MatchResultsTable";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { LoadingState } from "../ui/LoadingState";
import { QueryBoundary } from "../ui/QueryBoundary";

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

  const gamesQuery = useQuery({
    queryKey: qk.tournamentGames(tournamentId),
    queryFn: ({ signal }) => apiClient.getTournamentGames(tournamentId, signal),
  });

  // Raw logs power the ZIP export; `games` is the parsed view the table and
  // stats read. Both derive from `gamesQuery.data` — no duplicated state.
  const rawGames = useMemo(() => gamesQuery.data ?? [], [gamesQuery.data]);
  const games = useMemo<GameRecord[]>(
    () =>
      rawGames.map((g) => {
        const rec = g as Record<string, unknown>;
        return {
          scoreA: (rec.scoreA as number) ?? 0,
          scoreB: (rec.scoreB as number) ?? 0,
          aPlaysFirst: rec.aPlaysFirst as boolean | undefined,
          gameIndex: rec.gameIndex as number | undefined,
        };
      }),
    [rawGames],
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

  const outcomeOf = (g: GameRecord): MatchOutcome =>
    g.scoreA > g.scoreB ? "win" : g.scoreB > g.scoreA ? "loss" : "draw";

  const columns: MatchColumn<GameRecord>[] = [
    {
      id: "n",
      header: "#",
      cellClassName: "tabular-nums text-fg-secondary",
      cell: (_g, i) => i + 1,
    },
    {
      id: "first",
      header: "First Player",
      align: "center",
      cellClassName: "text-xs text-fg-secondary",
      cell: (g) => (g.aPlaysFirst != null ? (g.aPlaysFirst ? labelA : labelB) : "—"),
    },
    {
      id: "scoreA",
      header: labelA,
      align: "right",
      cellClassName: (g) => `tabular-nums font-semibold ${scoreToneClass(outcomeOf(g))}`,
      cell: (g) => g.scoreA,
    },
    {
      id: "scoreB",
      header: labelB,
      align: "right",
      cellClassName: (g) =>
        `tabular-nums font-semibold ${scoreToneClass(invertOutcome(outcomeOf(g)))}`,
      cell: (g) => g.scoreB,
    },
    {
      id: "diff",
      header: "Diff",
      align: "right",
      cellClassName: "tabular-nums text-fg-muted",
      cell: (g) => formatDiff(g.scoreA - g.scoreB),
    },
    {
      id: "winner",
      header: "Winner",
      align: "center",
      cellClassName: "text-xs",
      cell: (g) => {
        const o = outcomeOf(g);
        return (
          <ResultText outcome={o}>
            {o === "win" ? labelA : o === "loss" ? labelB : "Draw"}
          </ResultText>
        );
      },
    },
  ];

  return (
    <MatchResultsLayout
      title={`${labelA} vs ${labelB}`}
      tally={
        gamesQuery.data && (
          <MatchTally
            total={games.length}
            wins={stats.aWins}
            losses={stats.bWins}
            draws={stats.draws}
            suffix={<> for {labelA}</>}
          />
        )
      }
      footer={
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
      }
    >
      <QueryBoundary
        query={gamesQuery}
        loading={<LoadingState />}
        isEmpty={(logs) => logs.length === 0}
        empty={<EmptyState title="No game logs found" description="Run the tournament first." />}
      >
        {() => (
          <MatchResultsTable
            columns={columns}
            rows={games}
            // Static tournament list — position is the identity. Each row still
            // carries its server `gameIndex` for the replay URL (preferred over
            // table position so filtering can't desync the link).
            rowKey={(_g, i) => i}
            onSelectRow={
              onSelectGameIndex ? (g, i) => onSelectGameIndex(g.gameIndex ?? i) : undefined
            }
          />
        )}
      </QueryBoundary>
    </MatchResultsLayout>
  );
}
