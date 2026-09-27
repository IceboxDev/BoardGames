import { useQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useGameShell } from "../../hooks/useGameShell";
import { apiClient } from "../../lib/api-client";
import { BoardFallback } from "../RouteFallback";
import { Button } from "../ui/Button";
import { ErrorAlert } from "../ui/ErrorAlert";

// ── Shared rendering ─────────────────────────────────────────────────────
//
// Fetches a stored game log and hands it to `def.replayComponent`, with the
// shared loading / error / "back" chrome around it.

function ReplayShell({
  loading,
  error,
  log,
  backHref,
  backLabel,
}: {
  loading: boolean;
  error: unknown;
  log: unknown;
  backHref: string;
  backLabel: string;
}) {
  const { def } = useGameShell();
  const navigate = useNavigate();

  if (loading) return <BoardFallback label="Loading replay…" />;

  if (error || !log) {
    return (
      <div className="mx-auto flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <ErrorAlert
          message={error instanceof Error ? error.message : "Replay could not be loaded."}
        />
        <Button variant="secondary" size="sm" onClick={() => navigate(backHref)}>
          {backLabel}
        </Button>
      </div>
    );
  }

  const Replay = def.replayComponent;
  if (!Replay) {
    // Defensive — both routes already check `def.replayComponent` before
    // mounting, so this is unreachable.
    return <Navigate to={`/play/${def.slug}`} replace />;
  }

  return (
    <Suspense fallback={<BoardFallback />}>
      <Replay game={log} onBack={() => navigate(backHref)} />
    </Suspense>
  );
}

// ── Match-history replay ─────────────────────────────────────────────────
//
// `/play/:slug/match-history/:replayId`. Lazy-fetches the stored replay
// log via `apiClient.getGameReplay(slug, id)` and renders it. Reached
// from the match-history list and from solo game-over "View Replay"
// affordances — both navigate here with the same URL so the replay
// survives refresh and the user can share / bookmark it.

export function MatchHistoryReplayRoute() {
  const { def } = useGameShell();
  const params = useParams<{ replayId: string }>();
  const replayId = Number.parseInt(params.replayId ?? "", 10);

  const valid = Number.isFinite(replayId) && replayId > 0;
  const query = useQuery({
    queryKey: ["game-replay", def.slug, replayId],
    queryFn: () => apiClient.getGameReplay(def.slug, replayId),
    enabled: valid,
  });

  if (!def.manifest || !def.replayComponent) {
    return <Navigate to={`/play/${def.slug}`} replace />;
  }
  if (!valid) {
    return <Navigate to={`/play/${def.slug}/match-history`} replace />;
  }

  return (
    <ReplayShell
      loading={query.isPending}
      error={query.error}
      log={query.data}
      backHref={`/play/${def.slug}/match-history`}
      backLabel="Back to history"
    />
  );
}
