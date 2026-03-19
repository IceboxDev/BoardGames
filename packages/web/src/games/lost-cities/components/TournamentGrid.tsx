import { ALL_STRATEGIES } from "@boardgames/core/games/lost-cities/ai-strategies";
import { computeElo } from "@boardgames/core/games/lost-cities/tournament-elo";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../../../lib/api-client";

const NUM_GAMES = 100;

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
  onBack: () => void;
  onViewMatchHistory?: (aId: string, bId: string, tournamentId: string) => void;
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

export default function TournamentGrid({ onBack, onViewMatchHistory }: TournamentGridProps) {
  const [results, setResults] = useState<TournamentResult[]>([]);
  const [running, setRunning] = useState<RunState | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const reloadResults = useCallback(async () => {
    const tournaments = await apiClient.listTournaments("lost-cities", "completed");
    const mapped = tournaments
      .map((t) => serverResultToLocal(t))
      .filter((r): r is TournamentResult => r !== null);
    setResults(mapped);
  }, []);

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

    apiClient.listTournaments("lost-cities", "running").then((tournaments) => {
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
  }, [reloadResults, subscribeToProgress]);

  const getResult = useCallback(
    (aId: string, bId: string) => results.find((r) => r.strategyA === aId && r.strategyB === bId),
    [results],
  );

  const runPair = useCallback(
    async (aId: string, bId: string) => {
      if (running) return;

      const { id } = await apiClient.startTournament("lost-cities", {
        strategyAId: aId,
        strategyBId: bId,
        numGames: NUM_GAMES,
      });

      setRunning({ tournamentId: id, aId, bId, completed: 0, total: NUM_GAMES });
      subscribeToProgress(id);
    },
    [running, subscribeToProgress],
  );

  const runAll = useCallback(async () => {
    if (running) return;

    const pairs: [string, string][] = [];
    for (let i = 0; i < ALL_STRATEGIES.length; i++) {
      for (let j = i + 1; j < ALL_STRATEGIES.length; j++) {
        const existing = getResult(ALL_STRATEGIES[i].id, ALL_STRATEGIES[j].id);
        if (!existing) {
          pairs.push([ALL_STRATEGIES[i].id, ALL_STRATEGIES[j].id]);
        }
      }
    }

    if (pairs.length === 0) return;

    const runNext = async (idx: number) => {
      if (idx >= pairs.length) return;
      const [aId, bId] = pairs[idx];

      const { id } = await apiClient.startTournament("lost-cities", {
        strategyAId: aId,
        strategyBId: bId,
        numGames: NUM_GAMES,
      });

      setRunning({ tournamentId: id, aId, bId, completed: 0, total: NUM_GAMES });

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
  }, [running, getResult, reloadResults]);

  const handleClear = useCallback(async () => {
    const tournaments = await apiClient.listTournaments("lost-cities", "completed");
    await Promise.all(tournaments.map((t) => apiClient.abortTournament(t.id).catch(() => {})));
    setResults([]);
  }, []);

  const handleStop = useCallback(async () => {
    if (running) {
      await apiClient.abortTournament(running.tournamentId);
      setRunning(null);
      esRef.current?.close();
      esRef.current = null;
      reloadResults();
    }
  }, [running, reloadResults]);

  const strategies = ALL_STRATEGIES;

  const eloRatings = useMemo(() => {
    const strategyIds = strategies.map((s) => s.id);
    return computeElo(results, strategyIds);
  }, [results, strategies]);

  return (
    <div className="flex flex-col items-center gap-6 px-4 py-8 max-w-3xl mx-auto">
      <div className="text-center">
        <h2 className="text-3xl font-extrabold text-white">AI Tournament</h2>
        <p className="mt-2 text-sm text-gray-400">
          Full MCTS simulation &middot; {NUM_GAMES} games per matchup &middot; alternating first
          player
        </p>
      </div>

      {results.length > 0 && (
        <div className="w-full max-w-2xl rounded-xl bg-gray-800/60 px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            ELO ratings
          </h3>
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            {strategies.map((s) => (
              <span key={s.id} className="text-sm">
                <span className="text-gray-400">{s.label}:</span>{" "}
                <span className="font-semibold text-white tabular-nums">
                  {Math.round(eloRatings.get(s.id) ?? 1500)}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {running && (
        <div className="w-full max-w-md">
          <div className="text-xs text-gray-400 text-center mb-1">
            {strategies.find((s) => s.id === running.aId)?.label} vs{" "}
            {strategies.find((s) => s.id === running.bId)?.label}
            {" — "}
            {running.completed} / {running.total}
          </div>
          <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden">
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
                  const aId = running.aId < running.bId ? running.aId : running.bId;
                  const bId = running.aId < running.bId ? running.bId : running.aId;
                  onViewMatchHistory(aId, bId, running.tournamentId);
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

      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="p-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 border-b border-gray-800">
                Row vs Col
              </th>
              {strategies.map((col) => (
                <th
                  key={col.id}
                  className="p-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 border-b border-gray-800"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {strategies.map((row) => (
              <tr key={row.id}>
                <td className="p-3 font-semibold text-white border-b border-gray-800/50 whitespace-nowrap">
                  {row.label}
                </td>
                {strategies.map((col) => {
                  if (row.id === col.id) {
                    return (
                      <td
                        key={col.id}
                        className="p-3 text-center text-gray-600 border-b border-gray-800/50"
                      >
                        —
                      </td>
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

                  const pairAId = row.id < col.id ? row.id : col.id;
                  const pairBId = row.id < col.id ? col.id : row.id;

                  return (
                    <td key={col.id} className="p-3 text-center border-b border-gray-800/50">
                      {winRate !== null && tournamentId ? (
                        <button
                          type="button"
                          className="flex w-full flex-col gap-0.5 cursor-pointer rounded-md px-1 py-0.5 text-left transition-colors hover:bg-gray-800/60"
                          onClick={() => onViewMatchHistory?.(pairAId, pairBId, tournamentId)}
                        >
                          <span
                            className={`text-base font-bold ${
                              winRate >= 50 ? "text-green-400" : "text-red-400"
                            }`}
                          >
                            {winRate.toFixed(1)}%
                          </span>
                          <span className="text-xs text-gray-500">
                            avg {avgDiff! > 0 ? "+" : ""}
                            {avgDiff}
                          </span>
                          <span className="text-[10px] text-gray-600">{gamesPlayed} games</span>
                        </button>
                      ) : isRunning ? (
                        <span className="text-xs text-indigo-400 animate-pulse">Running...</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const aId = row.id < col.id ? row.id : col.id;
                            const bId = row.id < col.id ? col.id : row.id;
                            runPair(aId, bId);
                          }}
                          disabled={!!running}
                          className="text-xs text-gray-500 hover:text-indigo-400 transition-colors disabled:opacity-30"
                        >
                          Run
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-4 mt-2">
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

      <button
        type="button"
        onClick={onBack}
        className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
      >
        Back to AI Selection
      </button>
    </div>
  );
}
