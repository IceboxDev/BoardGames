import { computeElo } from "@boardgames/core/tournament/elo";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../../lib/api-client";

interface TournamentResult {
  id: string;
  strategyA: string;
  strategyB: string;
  gamesPlayed: number;
  aWins: number;
  bWins: number;
  draws: number;
  avgScoreA: number;
  avgScoreB: number;
  timestamp: number;
}

interface RunState {
  tournamentId: string;
  aId: string;
  bId: string;
  completed: number;
  total: number;
}

interface TournamentGridProps {
  gameSlug: string;
  strategies: { id: string; label: string }[];
  gamesPerMatchup?: number;
  showScoreDiff?: boolean;
  onViewMatchHistory?: (strategyAId: string, strategyBId: string, tournamentId: string) => void;
}

function serverResultToLocal(t: {
  id: string;
  config: Record<string, unknown>;
  result: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
}): TournamentResult | null {
  const r = t.result;
  if (!r) return null;

  const gamesPlayed = (r.gamesPlayed as number) ?? 0;
  return {
    id: t.id,
    strategyA: (r.strategyA as string) ?? (t.config.strategyAId as string) ?? "",
    strategyB: (r.strategyB as string) ?? (t.config.strategyBId as string) ?? "",
    gamesPlayed,
    aWins: (r.aWins as number) ?? 0,
    bWins: (r.bWins as number) ?? 0,
    draws: (r.draws as number) ?? 0,
    avgScoreA: gamesPlayed > 0 ? Math.round((r.totalScoreA as number) / gamesPlayed) : 0,
    avgScoreB: gamesPlayed > 0 ? Math.round((r.totalScoreB as number) / gamesPlayed) : 0,
    timestamp: new Date(t.completed_at ?? t.created_at).getTime(),
  };
}

export default function TournamentGrid({
  gameSlug,
  strategies,
  gamesPerMatchup = 100,
  showScoreDiff = true,
  onViewMatchHistory,
}: TournamentGridProps) {
  const [results, setResults] = useState<TournamentResult[]>([]);
  const [running, setRunning] = useState<RunState | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const reloadResults = useCallback(async () => {
    const tournaments = await apiClient.listTournaments(gameSlug, "completed");
    const mapped = tournaments
      .map((t) => serverResultToLocal(t))
      .filter((r): r is TournamentResult => r !== null && r.gamesPlayed > 0);
    setResults(mapped);
  }, [gameSlug]);

  const subscribeToProgress = useCallback(
    (tournamentId: string) => {
      esRef.current?.close();
      const es = apiClient.streamProgress(tournamentId);
      esRef.current = es;

      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.kind === "progress") {
          setRunning((prev) =>
            prev ? { ...prev, completed: data.completed, total: data.total } : null,
          );
        } else if (data.kind === "complete") {
          reloadResults();
          setRunning(null);
          es.close();
          esRef.current = null;
        } else if (data.kind === "error") {
          setRunning(null);
          es.close();
          esRef.current = null;
        }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        setRunning(null);
      };
    },
    [reloadResults],
  );

  useEffect(() => {
    reloadResults();

    apiClient.listTournaments(gameSlug, "running").then((tournaments) => {
      if (tournaments.length > 0) {
        const t = tournaments[0];
        const cfg = t.config as { strategyAId: string; strategyBId: string };
        setRunning({
          tournamentId: t.id,
          aId: cfg.strategyAId,
          bId: cfg.strategyBId,
          completed: t.progress_completed,
          total: t.progress_total,
        });
        subscribeToProgress(t.id);
      }
    });

    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [gameSlug, reloadResults, subscribeToProgress]);

  const getResult = useCallback(
    (aId: string, bId: string) => results.find((r) => r.strategyA === aId && r.strategyB === bId),
    [results],
  );

  const runPair = useCallback(
    async (aId: string, bId: string) => {
      if (running) return;

      const { id } = await apiClient.startTournament(gameSlug, {
        strategyAId: aId,
        strategyBId: bId,
        numGames: gamesPerMatchup,
      });

      setRunning({ tournamentId: id, aId, bId, completed: 0, total: gamesPerMatchup });
      subscribeToProgress(id);
    },
    [gameSlug, gamesPerMatchup, running, subscribeToProgress],
  );

  const runAll = useCallback(async () => {
    if (running) return;

    const pairs: [string, string][] = [];
    for (let i = 0; i < strategies.length; i++) {
      for (let j = i + 1; j < strategies.length; j++) {
        const existing = getResult(strategies[i].id, strategies[j].id);
        if (!existing) {
          pairs.push([strategies[i].id, strategies[j].id]);
        }
      }
    }

    if (pairs.length === 0) return;

    const runNext = async (idx: number) => {
      if (idx >= pairs.length) return;
      const [aId, bId] = pairs[idx];

      const { id } = await apiClient.startTournament(gameSlug, {
        strategyAId: aId,
        strategyBId: bId,
        numGames: gamesPerMatchup,
      });

      setRunning({ tournamentId: id, aId, bId, completed: 0, total: gamesPerMatchup });

      esRef.current?.close();
      const es = apiClient.streamProgress(id);
      esRef.current = es;

      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.kind === "progress") {
          setRunning((prev) =>
            prev ? { ...prev, completed: data.completed, total: data.total } : null,
          );
        } else if (data.kind === "complete") {
          reloadResults();
          es.close();
          esRef.current = null;
          runNext(idx + 1).then(() => {
            if (idx + 1 >= pairs.length) setRunning(null);
          });
        } else if (data.kind === "error") {
          setRunning(null);
          es.close();
          esRef.current = null;
        }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        setRunning(null);
      };
    };

    await runNext(0);
  }, [gameSlug, gamesPerMatchup, running, strategies, getResult, reloadResults]);

  const handleClear = useCallback(async () => {
    const tournaments = await apiClient.listTournaments(gameSlug, "completed");
    await Promise.all(tournaments.map((t) => apiClient.abortTournament(t.id).catch(() => {})));
    setResults([]);
  }, [gameSlug]);

  const handleStop = useCallback(async () => {
    if (running) {
      await apiClient.abortTournament(running.tournamentId);
      setRunning(null);
      esRef.current?.close();
      esRef.current = null;
      reloadResults();
    }
  }, [running, reloadResults]);

  const eloRatings = useMemo(() => {
    const strategyIds = strategies.map((s) => s.id);
    return computeElo(results, strategyIds);
  }, [results, strategies]);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-4 py-6">
      {/* Header */}
      <div className="shrink-0 text-center">
        <h2 className="text-3xl font-extrabold text-white">AI Tournament</h2>
        <p className="mt-2 text-sm text-gray-400">
          {gamesPerMatchup} games per matchup &middot; alternating first player
        </p>
      </div>

      {/* Progress bar (when running) */}
      {running && (
        <div className="mx-auto mt-4 w-full max-w-md shrink-0">
          <div className="mb-1 text-center text-xs text-gray-400">
            {strategies.find((s) => s.id === running.aId)?.label} vs{" "}
            {strategies.find((s) => s.id === running.bId)?.label}
            {" — "}
            {running.completed} / {running.total}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
            <div
              className="h-full bg-indigo-500 transition-all duration-150"
              style={{ width: `${(running.completed / running.total) * 100}%` }}
            />
          </div>
          <div className="mt-2 flex gap-2">
            {running.completed > 0 && onViewMatchHistory && (
              <button
                type="button"
                onClick={() => {
                  onViewMatchHistory(running.aId, running.bId, running.tournamentId);
                }}
                className="flex-1 rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 transition hover:border-indigo-500 hover:text-indigo-400"
              >
                View {running.completed} game{running.completed !== 1 ? "s" : ""} so far
              </button>
            )}
            <button
              type="button"
              onClick={handleStop}
              className="flex-1 rounded-lg border border-red-700 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-900/30"
            >
              Stop (save partial)
            </button>
          </div>
        </div>
      )}

      {/* Grid — fills remaining space, no scroll */}
      <div className="mt-6 flex w-full flex-1 flex-col text-sm">
        {/* Header row */}
        <div
          className="grid h-10 shrink-0 items-center border-b border-gray-800"
          style={{
            gridTemplateColumns: `3.5rem 10rem repeat(${strategies.length}, 1fr)`,
          }}
        >
          <div className="px-1 text-center text-[8px] font-semibold uppercase tracking-wider text-gray-500">
            ELO
          </div>
          <div className="px-2 text-left text-[8px] font-semibold uppercase tracking-wider text-gray-500">
            Row vs Col
          </div>
          {strategies.map((col) => (
            <div
              key={col.id}
              className="px-1 text-center text-[8px] font-semibold uppercase leading-snug tracking-wide text-gray-500"
            >
              <span className="line-clamp-2">{col.label}</span>
            </div>
          ))}
        </div>
        {/* Data rows — equal height via CSS grid 1fr */}
        <div
          className="grid min-h-0 flex-1"
          style={{ gridTemplateRows: `repeat(${strategies.length}, 1fr)` }}
        >
          {strategies.map((row) => {
            const elo = Math.round(eloRatings.get(row.id) ?? 1500);
            const hasResults = results.length > 0;
            return (
              <div
                key={row.id}
                className="grid min-h-0 items-stretch"
                style={{
                  gridTemplateColumns: `3.5rem 10rem repeat(${strategies.length}, 1fr)`,
                }}
              >
                <div className="flex items-center justify-center border-b border-gray-800/50 px-1">
                  {hasResults ? (
                    <span className="tabular-nums text-xs font-semibold text-white">{elo}</span>
                  ) : (
                    <span className="text-gray-700">—</span>
                  )}
                </div>
                <div className="flex min-w-0 items-center border-b border-gray-800/50 px-2">
                  <span
                    className="line-clamp-2 text-sm font-semibold leading-snug text-white"
                    title={row.label}
                  >
                    {row.label}
                  </span>
                </div>
                {strategies.map((col) => {
                  if (row.id === col.id) {
                    return (
                      <div
                        key={col.id}
                        className="flex items-center justify-center border-b border-gray-800/50 text-gray-600"
                      >
                        —
                      </div>
                    );
                  }

                  const direct = getResult(row.id, col.id);
                  const inverse = getResult(col.id, row.id);

                  let winRate: number | null = null;
                  let avgDiff: number | null = null;
                  let gamesPlayed = 0;
                  let tournamentId: string | undefined;

                  if (direct) {
                    winRate =
                      direct.gamesPlayed > 0 ? (direct.aWins / direct.gamesPlayed) * 100 : null;
                    avgDiff = direct.avgScoreA - direct.avgScoreB;
                    gamesPlayed = direct.gamesPlayed;
                    tournamentId = direct.id;
                  } else if (inverse) {
                    winRate =
                      inverse.gamesPlayed > 0 ? (inverse.bWins / inverse.gamesPlayed) * 100 : null;
                    avgDiff = inverse.avgScoreB - inverse.avgScoreA;
                    gamesPlayed = inverse.gamesPlayed;
                    tournamentId = inverse.id;
                  }

                  const isRunning =
                    running &&
                    ((running.aId === row.id && running.bId === col.id) ||
                      (running.aId === col.id && running.bId === row.id));

                  const matchup = direct ?? inverse;

                  return (
                    <div key={col.id} className="border-b border-gray-800/50 p-0.5">
                      {winRate !== null && tournamentId && matchup ? (
                        <button
                          type="button"
                          className="flex h-full w-full cursor-pointer flex-col items-center justify-center rounded-lg transition-colors hover:bg-gray-800/60"
                          onClick={() =>
                            onViewMatchHistory?.(matchup.strategyA, matchup.strategyB, tournamentId)
                          }
                        >
                          <span
                            className={`text-sm font-bold tabular-nums leading-snug ${
                              winRate >= 50 ? "text-green-400" : "text-red-400"
                            }`}
                          >
                            {winRate.toFixed(1)}%
                          </span>
                          {showScoreDiff && (
                            <span className="text-[10px] tabular-nums leading-snug text-gray-500">
                              avg {(avgDiff ?? 0) > 0 ? "+" : ""}
                              {avgDiff}
                            </span>
                          )}
                          <span className="text-[9px] leading-snug text-gray-600">
                            {gamesPlayed} games
                          </span>
                        </button>
                      ) : isRunning ? (
                        <div className="flex h-full w-full items-center justify-center">
                          <span className="animate-pulse text-[10px] text-indigo-400">
                            Running...
                          </span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const aId = row.id < col.id ? row.id : col.id;
                            const bId = row.id < col.id ? col.id : row.id;
                            runPair(aId, bId);
                          }}
                          disabled={!!running}
                          className="flex h-full w-full items-center justify-center rounded-lg text-xs text-gray-500 transition-colors hover:text-indigo-400 disabled:opacity-30"
                        >
                          Run
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom actions */}
      <div className="mt-4 flex shrink-0 flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          onClick={runAll}
          disabled={!!running}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-40"
        >
          {running ? "Running..." : "Run All Matchups"}
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={!!running}
          className="rounded-lg border border-gray-700 px-5 py-2.5 text-sm font-semibold text-gray-400 transition hover:border-red-500 hover:text-red-400 disabled:opacity-40"
        >
          Clear Results
        </button>
      </div>
    </div>
  );
}
