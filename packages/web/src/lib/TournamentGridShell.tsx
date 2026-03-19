import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import { apiClient } from "./api-client";

export interface StrategyInfo {
  id: string;
  label: string;
}

interface TournamentProgress {
  completed: number;
  total: number;
}

export interface TournamentGridShellProps<TResult> {
  gameSlug: string;
  strategies: StrategyInfo[];
  numGames: number;
  onNumGamesChange?: (n: number) => void;
  renderCell: (aId: string, bId: string, result: TResult | undefined) => ReactNode;
  renderHeader?: () => ReactNode;
  results: Map<string, TResult>;
  onComplete: (aId: string, bId: string, result: TResult) => void;
  onClear: () => void;
  onBack: () => void;
}

type RunState = "idle" | "running" | "stopping";

export function TournamentGridShell<TResult>({
  gameSlug,
  strategies,
  numGames,
  onNumGamesChange,
  renderCell,
  renderHeader,
  results,
  onComplete,
  onClear,
  onBack,
}: TournamentGridShellProps<TResult>) {
  const [runState, setRunState] = useState<RunState>("idle");
  const [progress, setProgress] = useState<TournamentProgress | null>(null);
  const [currentPair, setCurrentPair] = useState<string | null>(null);
  const activeTournamentRef = useRef<string | null>(null);
  const queueRef = useRef<{ aId: string; bId: string }[]>([]);
  const stoppedRef = useRef(false);

  const runPair = useCallback(
    async (aId: string, bId: string): Promise<void> => {
      if (stoppedRef.current) return;

      setCurrentPair(`${aId} vs ${bId}`);
      setProgress({ completed: 0, total: numGames });

      const config: Record<string, unknown> = { numGames };

      if (gameSlug === "lost-cities") {
        config.strategyAId = aId;
        config.strategyBId = bId;
      } else {
        config.strategies = [aId, bId];
      }

      const { id } = await apiClient.startTournament(gameSlug, config);
      activeTournamentRef.current = id;

      return new Promise<void>((resolve) => {
        const es = apiClient.streamProgress(id);
        es.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.kind === "progress") {
            setProgress({ completed: data.completed, total: data.total });
          } else if (data.kind === "complete") {
            onComplete(aId, bId, data.result as TResult);
            es.close();
            activeTournamentRef.current = null;
            setProgress(null);
            resolve();
          } else if (data.kind === "error") {
            es.close();
            activeTournamentRef.current = null;
            setProgress(null);
            resolve();
          }
        };
        es.onerror = () => {
          es.close();
          activeTournamentRef.current = null;
          setProgress(null);
          resolve();
        };
      });
    },
    [gameSlug, numGames, onComplete],
  );

  const runAll = useCallback(async () => {
    stoppedRef.current = false;
    setRunState("running");

    const pairs: { aId: string; bId: string }[] = [];
    for (const a of strategies) {
      for (const b of strategies) {
        if (a.id === b.id) continue;
        if (results.has(`${a.id}--${b.id}`)) continue;
        pairs.push({ aId: a.id, bId: b.id });
      }
    }

    queueRef.current = pairs;

    for (const pair of pairs) {
      if (stoppedRef.current) break;
      await runPair(pair.aId, pair.bId);
    }

    setRunState("idle");
    setCurrentPair(null);
  }, [strategies, results, runPair]);

  const stop = useCallback(async () => {
    stoppedRef.current = true;
    setRunState("stopping");
    if (activeTournamentRef.current) {
      await apiClient.abortTournament(activeTournamentRef.current);
    }
  }, []);

  const progressPct = progress ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={onBack}
          className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded text-white"
        >
          ← Back
        </button>
        <h2 className="text-xl font-bold text-white">Tournament Grid</h2>
      </div>

      {renderHeader?.()}

      <div className="flex items-center gap-3 mb-4">
        <label className="text-gray-300 text-sm">
          Games per matchup:
          <input
            type="number"
            value={numGames}
            onChange={(e) => onNumGamesChange?.(Number(e.target.value))}
            className="ml-2 w-20 px-2 py-1 bg-gray-800 text-white rounded border border-gray-600"
            min={1}
            max={10000}
            disabled={runState !== "idle"}
          />
        </label>

        {runState === "idle" ? (
          <>
            <button
              type="button"
              onClick={runAll}
              className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 rounded text-white"
            >
              Run All
            </button>
            <button
              type="button"
              onClick={onClear}
              className="px-3 py-1 text-sm bg-red-700 hover:bg-red-600 rounded text-white"
            >
              Clear
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={stop}
            disabled={runState === "stopping"}
            className="px-3 py-1 text-sm bg-yellow-600 hover:bg-yellow-500 rounded text-white disabled:opacity-50"
          >
            {runState === "stopping" ? "Stopping…" : "Stop"}
          </button>
        )}
      </div>

      {progress && (
        <div className="mb-4">
          <div className="text-sm text-gray-400 mb-1">
            {currentPair} — {progress.completed}/{progress.total} ({progressPct}%)
          </div>
          <div className="h-2 bg-gray-700 rounded overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th className="p-2 text-gray-400" />
              {strategies.map((s) => (
                <th key={s.id} className="p-2 text-gray-300 font-medium text-center">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {strategies.map((a) => (
              <tr key={a.id}>
                <td className="p-2 text-gray-300 font-medium">{a.label}</td>
                {strategies.map((b) => (
                  <td key={b.id} className="p-1">
                    {a.id === b.id ? (
                      <div className="w-full h-full bg-gray-800 rounded p-2 text-center text-gray-600">
                        —
                      </div>
                    ) : (
                      <div className="min-w-[120px]">
                        {renderCell(a.id, b.id, results.get(`${a.id}--${b.id}`))}
                        {!results.has(`${a.id}--${b.id}`) && runState === "idle" && (
                          <button
                            type="button"
                            onClick={() => {
                              stoppedRef.current = false;
                              setRunState("running");
                              runPair(a.id, b.id).then(() => setRunState("idle"));
                            }}
                            className="mt-1 w-full text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
                          >
                            Run
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
