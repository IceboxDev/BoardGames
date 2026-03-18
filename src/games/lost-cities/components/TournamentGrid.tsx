import { useCallback, useEffect, useRef, useState } from "react";
import { ALL_STRATEGIES } from "../logic/ai-strategies";
import {
  clearTournamentResults,
  loadTournamentResults,
  saveTournamentGames,
  saveTournamentResult,
  type TournamentResult,
} from "../logic/tournament-persistence";
import type { TournamentMessage, TournamentRequest } from "../logic/tournament-worker";

const NUM_GAMES = 100;

interface RunState {
  aId: string;
  bId: string;
  completed: number;
  total: number;
}

interface TournamentGridProps {
  onBack: () => void;
  onViewMatchHistory?: (aId: string, bId: string) => void;
}

export default function TournamentGrid({ onBack, onViewMatchHistory }: TournamentGridProps) {
  const [results, setResults] = useState<TournamentResult[]>([]);
  const [running, setRunning] = useState<RunState | null>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    setResults(loadTournamentResults());
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const getResult = useCallback(
    (aId: string, bId: string) => results.find((r) => r.strategyA === aId && r.strategyB === bId),
    [results],
  );

  const runPair = useCallback(
    (aId: string, bId: string) => {
      if (running) return;

      workerRef.current?.terminate();
      const worker = new Worker(new URL("../logic/tournament-worker.ts", import.meta.url), {
        type: "module",
      });
      workerRef.current = worker;

      setRunning({ aId, bId, completed: 0, total: NUM_GAMES });

      worker.onmessage = (e: MessageEvent<TournamentMessage>) => {
        const msg = e.data;
        if (msg.kind === "progress") {
          setRunning((prev) => (prev ? { ...prev, completed: msg.completed } : null));
        } else {
          const result: TournamentResult = {
            strategyA: msg.strategyA,
            strategyB: msg.strategyB,
            gamesPlayed: msg.gamesPlayed,
            aWins: msg.aWins,
            bWins: msg.bWins,
            draws: msg.draws,
            avgScoreA: msg.gamesPlayed > 0 ? Math.round(msg.totalScoreA / msg.gamesPlayed) : 0,
            avgScoreB: msg.gamesPlayed > 0 ? Math.round(msg.totalScoreB / msg.gamesPlayed) : 0,
            timestamp: Date.now(),
          };

          saveTournamentResult(result);
          saveTournamentGames(msg.strategyA, msg.strategyB, msg.games);
          setResults(loadTournamentResults());
          setRunning(null);
          worker.terminate();
          workerRef.current = null;
        }
      };

      worker.postMessage({
        strategyAId: aId,
        strategyBId: bId,
        numGames: NUM_GAMES,
      } satisfies TournamentRequest);
    },
    [running],
  );

  const runAll = useCallback(() => {
    if (running) return;

    const pairs: [string, string][] = [];
    for (let i = 0; i < ALL_STRATEGIES.length; i++) {
      for (let j = i + 1; j < ALL_STRATEGIES.length; j++) {
        pairs.push([ALL_STRATEGIES[i].id, ALL_STRATEGIES[j].id]);
      }
    }

    let idx = 0;
    const runNext = () => {
      if (idx >= pairs.length) return;
      const [aId, bId] = pairs[idx++];

      workerRef.current?.terminate();
      const worker = new Worker(new URL("../logic/tournament-worker.ts", import.meta.url), {
        type: "module",
      });
      workerRef.current = worker;

      setRunning({ aId, bId, completed: 0, total: NUM_GAMES });

      worker.onmessage = (e: MessageEvent<TournamentMessage>) => {
        const msg = e.data;
        if (msg.kind === "progress") {
          setRunning((prev) => (prev ? { ...prev, completed: msg.completed } : null));
        } else {
          const result: TournamentResult = {
            strategyA: msg.strategyA,
            strategyB: msg.strategyB,
            gamesPlayed: msg.gamesPlayed,
            aWins: msg.aWins,
            bWins: msg.bWins,
            draws: msg.draws,
            avgScoreA: msg.gamesPlayed > 0 ? Math.round(msg.totalScoreA / msg.gamesPlayed) : 0,
            avgScoreB: msg.gamesPlayed > 0 ? Math.round(msg.totalScoreB / msg.gamesPlayed) : 0,
            timestamp: Date.now(),
          };

          saveTournamentResult(result);
          saveTournamentGames(msg.strategyA, msg.strategyB, msg.games);
          setResults(loadTournamentResults());
          setRunning(null);
          worker.terminate();
          workerRef.current = null;
          runNext();
        }
      };

      worker.postMessage({
        strategyAId: aId,
        strategyBId: bId,
        numGames: NUM_GAMES,
      } satisfies TournamentRequest);
    };

    runNext();
  }, [running]);

  const handleClear = useCallback(() => {
    clearTournamentResults();
    setResults([]);
  }, []);

  const strategies = ALL_STRATEGIES;

  return (
    <div className="flex flex-col items-center gap-6 px-4 py-8 max-w-3xl mx-auto">
      <div className="text-center">
        <h2 className="text-3xl font-extrabold text-white">AI Tournament</h2>
        <p className="mt-2 text-sm text-gray-400">
          Full MCTS simulation &middot; {NUM_GAMES} games per matchup &middot; alternating first
          player
        </p>
      </div>

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

                  if (direct) {
                    winRate =
                      direct.gamesPlayed > 0 ? (direct.aWins / direct.gamesPlayed) * 100 : null;
                    avgDiff = direct.avgScoreA - direct.avgScoreB;
                    gamesPlayed = direct.gamesPlayed;
                  } else if (inverse) {
                    winRate =
                      inverse.gamesPlayed > 0 ? (inverse.bWins / inverse.gamesPlayed) * 100 : null;
                    avgDiff = inverse.avgScoreB - inverse.avgScoreA;
                    gamesPlayed = inverse.gamesPlayed;
                  }

                  const isRunning =
                    running &&
                    ((running.aId === row.id && running.bId === col.id) ||
                      (running.aId === col.id && running.bId === row.id));

                  const pairAId = row.id < col.id ? row.id : col.id;
                  const pairBId = row.id < col.id ? col.id : row.id;

                  return (
                    <td key={col.id} className="p-3 text-center border-b border-gray-800/50">
                      {winRate !== null ? (
                        <button
                          type="button"
                          className="flex w-full flex-col gap-0.5 cursor-pointer rounded-md px-1 py-0.5 text-left transition-colors hover:bg-gray-800/60"
                          onClick={() => onViewMatchHistory?.(pairAId, pairBId)}
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

      <div className="flex gap-4 mt-2">
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
