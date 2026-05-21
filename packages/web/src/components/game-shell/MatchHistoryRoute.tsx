import { Suspense } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useGameShell } from "../../hooks/useGameShell";
import { MatchHistory } from "../match-history";

/**
 * Route element at `/play/:slug/match-history`. Renders the generic
 * `<MatchHistory>` table with a game-specific label resolver (engine /
 * strategy id → human label). Clicking a row navigates to the dedicated
 * replay URL — that URL is bookmarkable and survives refresh.
 *
 * The replay component itself is rendered by `<MatchHistoryReplayRoute>`,
 * which fetches the log by id and re-uses the game's
 * `def.replayComponent`. Set's custom history component (see
 * `def.matchHistoryComponent`) wires its own internal navigation; the
 * route just hands it the back callback.
 */
export default function MatchHistoryRoute() {
  const navigate = useNavigate();
  const { def } = useGameShell();

  if (!def.hasMatchHistory) {
    return <Navigate to={`/play/${def.slug}`} replace />;
  }

  // Game-specific override (Set has a dual trainer/PvP tabbed view).
  // The custom component owns its own internal navigation; we just pass
  // it the route's `onBack` so it knows where to return.
  if (def.matchHistoryComponent) {
    const Custom = def.matchHistoryComponent;
    return (
      <Suspense fallback={null}>
        <Custom onBack={() => navigate(`/play/${def.slug}`)} />
      </Suspense>
    );
  }

  return (
    <MatchHistory
      gameSlug={def.slug}
      labelResolver={def.matchHistoryLabelResolver ?? ((id) => id)}
      onBack={() => navigate(`/play/${def.slug}`)}
      onSelectReplay={
        def.replayComponent ? (id) => navigate(`/play/${def.slug}/match-history/${id}`) : undefined
      }
    />
  );
}
