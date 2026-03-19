import type { TournamentGameLog } from "@boardgames/core/games/lost-cities/tournament-log";
import type { AIEngine } from "@boardgames/core/games/lost-cities/types";
import { AI_ENGINE_LABELS } from "@boardgames/core/games/lost-cities/types";
import { useEffect, useState } from "react";
import { apiClient, type ReplaySummary } from "../../../lib/api-client";

interface MatchHistoryProps {
  onBack: () => void;
  onSelectGame: (game: TournamentGameLog) => void;
}

export default function MatchHistory({ onBack, onSelectGame }: MatchHistoryProps) {
  const [replays, setReplays] = useState<ReplaySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  useEffect(() => {
    apiClient
      .getGameReplays("lost-cities")
      .then((data) => {
        setReplays(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function handleSelect(replay: ReplaySummary) {
    setLoadingId(replay.id);
    apiClient
      .getGameReplay("lost-cities", replay.id)
      .then((log) => {
        setLoadingId(null);
        onSelectGame(log as TournamentGameLog);
      })
      .catch(() => setLoadingId(null));
  }

  const wins = replays.filter((r) => r.winner === "p0").length;
  const losses = replays.filter((r) => r.winner === "p1").length;
  const draws = replays.filter((r) => r.winner === "draw").length;

  return (
    <div className="flex flex-col items-center gap-6 px-4 py-8 max-w-4xl mx-auto">
      <div className="text-center">
        <h2 className="text-2xl font-extrabold text-white">Match History</h2>
        <p className="mt-2 text-sm text-gray-400">
          {loading ? (
            "Loading..."
          ) : (
            <>
              {replays.length} games &middot; <span className="text-green-400">{wins}W</span> /{" "}
              <span className="text-red-400">{losses}L</span> /{" "}
              <span className="text-gray-400">{draws}D</span>
            </>
          )}
        </p>
      </div>

      {!loading && replays.length === 0 ? (
        <p className="text-gray-500 text-sm italic py-12">
          No games played yet. Play a game against the AI first.
        </p>
      ) : !loading ? (
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-xs font-medium uppercase tracking-wider text-gray-500 border-b border-gray-800">
                <th className="p-2.5 text-left">#</th>
                <th className="p-2.5 text-left">Opponent</th>
                <th className="p-2.5 text-right">You</th>
                <th className="p-2.5 text-right">AI</th>
                <th className="p-2.5 text-right">Diff</th>
                <th className="p-2.5 text-center">Result</th>
                <th className="p-2.5 text-right">Date</th>
              </tr>
            </thead>
            <tbody>
              {replays.map((r, i) => {
                const diff = (r.scoreP0 ?? 0) - (r.scoreP1 ?? 0);
                const won = r.winner === "p0";
                const lost = r.winner === "p1";

                return (
                  <tr
                    key={r.id}
                    onClick={() => handleSelect(r)}
                    className={`border-b border-gray-800/40 cursor-pointer transition-colors hover:bg-gray-800/50 ${
                      loadingId === r.id ? "opacity-50" : ""
                    }`}
                  >
                    <td className="p-2.5 text-gray-400 tabular-nums">{i + 1}</td>
                    <td className="p-2.5 text-gray-300 text-xs">
                      {AI_ENGINE_LABELS[r.aiEngine as AIEngine] ?? r.aiEngine ?? "Unknown"}
                    </td>
                    <td
                      className={`p-2.5 text-right tabular-nums font-semibold ${
                        won ? "text-green-400" : lost ? "text-red-400" : "text-gray-400"
                      }`}
                    >
                      {r.scoreP0 ?? "—"}
                    </td>
                    <td
                      className={`p-2.5 text-right tabular-nums font-semibold ${
                        lost ? "text-green-400" : won ? "text-red-400" : "text-gray-400"
                      }`}
                    >
                      {r.scoreP1 ?? "—"}
                    </td>
                    <td className="p-2.5 text-right tabular-nums text-gray-500">
                      {diff > 0 ? "+" : ""}
                      {diff}
                    </td>
                    <td className="p-2.5 text-center text-xs">
                      {won ? (
                        <span className="text-green-400">Win</span>
                      ) : lost ? (
                        <span className="text-red-400">Loss</span>
                      ) : (
                        <span className="text-gray-500">Draw</span>
                      )}
                    </td>
                    <td className="p-2.5 text-right text-xs text-gray-500">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onBack}
        className="text-sm text-gray-500 hover:text-gray-300 transition-colors mt-2"
      >
        Back
      </button>
    </div>
  );
}
