import { formatTime } from "@boardgames/core/games/set/metrics";
import type { GameRecord } from "@boardgames/core/games/set/types";
import { useMemo, useState } from "react";
import Sparkline from "./charts/Sparkline";
import GameDetailModal from "./GameDetailModal";
import ProgressDashboard from "./ProgressDashboard";

type SortKey = "rating" | "timestamp" | "netScore" | "avgFindTimeMs" | "throughput" | "accuracy";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "rating", label: "Rating" },
  { key: "netScore", label: "Net Score" },
  { key: "throughput", label: "Throughput" },
  { key: "accuracy", label: "Accuracy" },
  { key: "avgFindTimeMs", label: "Avg Time" },
  { key: "timestamp", label: "Date" },
];

interface HighScoresProps {
  history: GameRecord[];
  onClear: () => void;
  onBack: () => void;
}

type Tab = "history" | "progress";

export default function HighScores({ history, onClear, onBack }: HighScoresProps) {
  const [tab, setTab] = useState<Tab>("history");
  const [sortBy, setSortBy] = useState<SortKey>("rating");
  const [confirmClear, setConfirmClear] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameRecord | null>(null);

  const sorted = useMemo(
    () =>
      [...history].sort((a, b) => {
        if (sortBy === "avgFindTimeMs") return a[sortBy] - b[sortBy];
        if (sortBy === "timestamp") return b[sortBy] - a[sortBy];
        return (b[sortBy] as number) - (a[sortBy] as number);
      }),
    [history, sortBy],
  );

  const chronological = useMemo(
    () => [...history].sort((a, b) => a.timestamp - b.timestamp),
    [history],
  );

  const ratingTrend = useMemo(() => chronological.slice(-10).map((r) => r.rating), [chronological]);

  const personalBests = useMemo(() => {
    if (history.length === 0) return new Map<string, Set<string>>();
    const pbMap = new Map<string, Set<string>>();
    const keys: { key: SortKey; lower?: boolean }[] = [
      { key: "rating" },
      { key: "netScore" },
      { key: "throughput" },
      { key: "accuracy" },
      { key: "avgFindTimeMs", lower: true },
    ];
    for (const { key, lower } of keys) {
      const best = lower
        ? Math.min(...history.filter((r) => (r[key] as number) > 0).map((r) => r[key] as number))
        : Math.max(...history.map((r) => r[key] as number));
      for (const r of history) {
        if ((r[key] as number) === best && Number.isFinite(best)) {
          if (!pbMap.has(r.id)) pbMap.set(r.id, new Set());
          pbMap.get(r.id)?.add(key);
        }
      }
    }
    return pbMap;
  }, [history]);

  const quartiles = useMemo(() => {
    if (history.length < 4) return { top: Infinity, bottom: -Infinity };
    const ratings = [...history].map((r) => r.rating).sort((a, b) => a - b);
    return {
      top: ratings[Math.floor(ratings.length * 0.75)],
      bottom: ratings[Math.floor(ratings.length * 0.25)],
    };
  }, [history]);

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    onClear();
    setConfirmClear(false);
  };

  return (
    <div className="mx-auto max-w-4xl py-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">High Scores</h2>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleClear}
            className="rounded-lg bg-red-900/50 px-4 py-2 text-sm text-red-300 transition hover:bg-red-900"
          >
            {confirmClear ? "Confirm Clear?" : "Clear History"}
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

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-gray-800 pb-px">
        <button
          type="button"
          onClick={() => setTab("history")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === "history"
              ? "border-indigo-500 text-white"
              : "border-transparent text-gray-500 hover:text-gray-300"
          }`}
        >
          History
        </button>
        <button
          type="button"
          onClick={() => setTab("progress")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === "progress"
              ? "border-indigo-500 text-white"
              : "border-transparent text-gray-500 hover:text-gray-300"
          }`}
        >
          Progress
        </button>
      </div>

      {tab === "progress" ? (
        <ProgressDashboard history={history} />
      ) : sorted.length === 0 ? (
        <p className="text-center text-gray-500 mt-12">
          No games played yet. Complete a game to see scores here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="px-3 py-2 text-gray-500">#</th>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => setSortBy(col.key)}
                    className={`cursor-pointer px-3 py-2 transition hover:text-white ${
                      sortBy === col.key ? "text-indigo-400" : "text-gray-500"
                    }`}
                  >
                    {col.label}
                    {sortBy === col.key && " ▾"}
                  </th>
                ))}
                {ratingTrend.length >= 2 && <th className="px-3 py-2 text-gray-500">Trend</th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((rec, i) => {
                const pbs = personalBests.get(rec.id);
                const rowBg =
                  rec.rating >= quartiles.top
                    ? "bg-green-900/10"
                    : rec.rating <= quartiles.bottom
                      ? "bg-red-900/10"
                      : "";

                return (
                  <tr
                    key={rec.id}
                    onClick={() => setSelectedGame(rec)}
                    className={`border-b border-gray-800/50 hover:bg-gray-800/40 cursor-pointer transition ${rowBg}`}
                  >
                    <td className="px-3 py-2 text-gray-600">{i + 1}</td>
                    <td className="px-3 py-2 font-bold text-white">
                      {rec.rating}
                      {pbs?.has("rating") && <PBBadge />}
                    </td>
                    <td className="px-3 py-2 text-gray-300">
                      {rec.netScore}
                      {pbs?.has("netScore") && <PBBadge />}
                    </td>
                    <td className="px-3 py-2 text-gray-300">
                      {rec.throughput}/min
                      {pbs?.has("throughput") && <PBBadge />}
                    </td>
                    <td className="px-3 py-2 text-gray-300">
                      {rec.accuracy}%{pbs?.has("accuracy") && <PBBadge />}
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-300">
                      {formatTime(rec.avgFindTimeMs)}
                      {pbs?.has("avgFindTimeMs") && <PBBadge />}
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {new Date(rec.timestamp).toLocaleDateString()}
                    </td>
                    {ratingTrend.length >= 2 && (
                      <td className="px-3 py-2">
                        <Sparkline data={ratingTrend} width={60} height={20} color="#818cf8" />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedGame && (
        <GameDetailModal
          record={selectedGame}
          history={history}
          onClose={() => setSelectedGame(null)}
        />
      )}
    </div>
  );
}

function PBBadge() {
  return (
    <span className="ml-1 inline-block rounded bg-yellow-500/20 px-1 py-px text-[10px] font-bold text-yellow-400 align-middle leading-tight">
      PB
    </span>
  );
}
