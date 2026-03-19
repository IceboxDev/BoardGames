import { ALL_STRATEGIES } from "@boardgames/core/games/exploding-kittens/ai-strategies";
import type { AIStrategyId } from "@boardgames/core/games/exploding-kittens/types";
import { AI_STRATEGY_LABELS } from "@boardgames/core/games/exploding-kittens/types";
import { useCallback, useRef, useState } from "react";
import {
  clearTournamentResults,
  loadTournamentResults,
  saveTournamentResult,
} from "../logic/tournament-persistence";
import type { TournamentMessage, TournamentRequest } from "../logic/tournament-worker";

interface TournamentGridProps {
  onBack: () => void;
}

const GAMES_PER_MATCHUP = 50;

export default function TournamentGrid({ onBack }: TournamentGridProps) {
  const [results, setResults] = useState(() => loadTournamentResults());
  const [running, setRunning] = useState<string | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const workerRef = useRef<Worker | null>(null);

  const strategyIds = ALL_STRATEGIES.map((s) => s.id as AIStrategyId);

  const runMatchup = useCallback((stratA: AIStrategyId, stratB: AIStrategyId) => {
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    const key = `${stratA}-vs-${stratB}`;
    setRunning(key);
    setProgress({ completed: 0, total: GAMES_PER_MATCHUP });

    const worker = new Worker(new URL("../logic/tournament-worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<TournamentMessage>) => {
      const msg = e.data;
      if (msg.kind === "progress") {
        setProgress({ completed: msg.completed, total: msg.total });
      } else {
        const result = {
          strategies: msg.strategies,
          gamesPlayed: msg.gamesPlayed,
          wins: msg.wins,
          timestamp: Date.now(),
        };
        saveTournamentResult(result);
        setResults(loadTournamentResults());
        setRunning(null);
        worker.terminate();
        workerRef.current = null;
      }
    };

    const request: TournamentRequest = {
      strategies: [stratA, stratB],
      numGames: GAMES_PER_MATCHUP,
    };
    worker.postMessage(request);
  }, []);

  const handleClear = useCallback(() => {
    clearTournamentResults();
    setResults([]);
  }, []);

  function getResult(a: AIStrategyId, b: AIStrategyId) {
    return results.find((r) => r.strategies.sort().join(",") === [a, b].sort().join(","));
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">AI Tournament</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleClear}
            className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-gray-400 transition hover:bg-gray-700"
          >
            Clear Results
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-white transition hover:bg-gray-600"
          >
            Back
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="p-2 text-left text-gray-500">vs</th>
              {strategyIds.map((id) => (
                <th key={id} className="p-2 text-center text-gray-400">
                  {AI_STRATEGY_LABELS[id]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {strategyIds.map((rowId) => (
              <tr key={rowId}>
                <td className="p-2 font-medium text-gray-400">{AI_STRATEGY_LABELS[rowId]}</td>
                {strategyIds.map((colId) => {
                  if (rowId === colId) {
                    return (
                      <td key={colId} className="p-2 text-center text-gray-700">
                        —
                      </td>
                    );
                  }

                  const matchKey = `${rowId}-vs-${colId}`;
                  const isRunning = running === matchKey;
                  const result = getResult(rowId, colId);

                  if (isRunning) {
                    return (
                      <td key={colId} className="p-2 text-center">
                        <div className="text-xs text-amber-400">
                          Running {progress.completed}/{progress.total}
                        </div>
                      </td>
                    );
                  }

                  if (result) {
                    const rowWins = result.wins[rowId] ?? 0;
                    const total = result.gamesPlayed;
                    const pct = total > 0 ? (rowWins / total) * 100 : 0;

                    return (
                      <td key={colId} className="p-2 text-center">
                        <span
                          className={`font-mono text-xs ${pct >= 50 ? "text-green-400" : "text-red-400"}`}
                        >
                          {pct.toFixed(0)}%
                        </span>
                        <div className="text-[10px] text-gray-600">
                          {rowWins}/{total}
                        </div>
                      </td>
                    );
                  }

                  return (
                    <td key={colId} className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => runMatchup(rowId, colId)}
                        disabled={running !== null}
                        className="rounded bg-indigo-900/60 px-2 py-1 text-xs text-indigo-300 transition hover:bg-indigo-800 disabled:opacity-40"
                      >
                        Run
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
