import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiClient } from "../../lib/api-client";
import { qk } from "../../lib/query-keys";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { LoadingState } from "../ui/LoadingState";
import { QueryBoundary } from "../ui/QueryBoundary";

interface MatchHistoryProps {
  gameSlug: string;
  labelResolver: (engine: string) => string;
  /**
   * Column header for the AI-engine cell. Defaults to "Opponent"; co-op
   * games pass an accurate label ("AI Co-pilot" for Sky Team) since
   * there's no versus dynamic when the team wins or loses together.
   */
  opponentLabel?: string;
  onBack: () => void;
  /**
   * Called with the row's stable replay id when the user picks a game.
   * The caller — `<MatchHistoryRoute>` in production — uses the id to
   * navigate to `/play/:slug/match-history/:replayId`, which then fetches
   * and renders the replay. Keeps this table free of the actual log
   * payload and lets refresh / share / bookmark survive.
   */
  onSelectReplay?: (replayId: number) => void;
}

export default function MatchHistory({
  gameSlug,
  labelResolver,
  opponentLabel = "Opponent",
  onBack,
  onSelectReplay,
}: MatchHistoryProps) {
  const replaysQuery = useQuery({
    queryKey: qk.gameReplays(gameSlug),
    queryFn: ({ signal }) => apiClient.getGameReplays(gameSlug, signal),
  });
  const replays = useMemo(() => replaysQuery.data ?? [], [replaysQuery.data]);

  const wins = replays.filter((r) => r.winner === "p0").length;
  const losses = replays.filter((r) => r.winner === "p1").length;
  const draws = replays.filter((r) => r.winner === "draw").length;

  return (
    // `relative z-10` lifts this above the fixed `def.backgroundImage` at
    // `z-0` in `GameShellLayoutInner` — without a stacking context, the
    // positioned bg paints over our static block content (same fix as
    // `GameScreen` / sky-team `GameOverScreen`).
    <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 py-8">
      <div className="text-center">
        <h2 className="text-2xl font-extrabold text-white">Match History</h2>
        {replaysQuery.data && (
          <p className="mt-2 text-sm text-fg-secondary">
            {replays.length} games &middot; <span className="text-emerald-400">{wins}W</span> /{" "}
            <span className="text-rose-400">{losses}L</span> /{" "}
            <span className="text-fg-secondary">{draws}D</span>
          </p>
        )}
      </div>

      <QueryBoundary
        query={replaysQuery}
        loading={<LoadingState />}
        isEmpty={(rows) => rows.length === 0}
        empty={<EmptyState title="No games played yet" description="Play a game first." />}
      >
        {(rows) => (
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs font-medium uppercase tracking-wider text-fg-muted">
                  <th className="p-2.5 text-left">#</th>
                  <th className="p-2.5 text-left">{opponentLabel}</th>
                  <th className="p-2.5 text-right">You</th>
                  <th className="p-2.5 text-right">Opp</th>
                  <th className="p-2.5 text-right">Diff</th>
                  <th className="p-2.5 text-center">Result</th>
                  <th className="p-2.5 text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const diff = (r.scoreP0 ?? 0) - (r.scoreP1 ?? 0);
                  const won = r.winner === "p0";
                  const lost = r.winner === "p1";

                  return (
                    <tr
                      key={r.id}
                      onClick={() => onSelectReplay?.(r.id)}
                      className={`border-b border-white/10 transition-colors ${
                        onSelectReplay ? "cursor-pointer hover:bg-surface-800/50" : ""
                      }`}
                    >
                      <td className="p-2.5 tabular-nums text-fg-secondary">{i + 1}</td>
                      <td className="p-2.5 text-xs text-fg-secondary">
                        {r.aiEngine ? labelResolver(r.aiEngine) : "Human"}
                      </td>
                      <td
                        className={`p-2.5 text-right tabular-nums font-semibold ${
                          won ? "text-emerald-400" : lost ? "text-rose-400" : "text-fg-secondary"
                        }`}
                      >
                        {r.scoreP0 ?? "—"}
                      </td>
                      <td
                        className={`p-2.5 text-right tabular-nums font-semibold ${
                          lost ? "text-emerald-400" : won ? "text-rose-400" : "text-fg-secondary"
                        }`}
                      >
                        {r.scoreP1 ?? "—"}
                      </td>
                      <td className="p-2.5 text-right tabular-nums text-fg-muted">
                        {diff > 0 ? "+" : ""}
                        {diff}
                      </td>
                      <td className="p-2.5 text-center text-xs">
                        {won ? (
                          <span className="text-emerald-400">Win</span>
                        ) : lost ? (
                          <span className="text-rose-400">Loss</span>
                        ) : (
                          <span className="text-fg-muted">Draw</span>
                        )}
                      </td>
                      <td className="p-2.5 text-right text-xs text-fg-muted">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </QueryBoundary>

      <Button variant="link" onClick={onBack} className="mt-2 text-sm">
        Back
      </Button>
    </div>
  );
}
