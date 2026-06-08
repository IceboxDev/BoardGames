import { useQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useGameShell } from "../../hooks/useGameShell";
import { apiClient } from "../../lib/api-client";
import { Button } from "../ui/Button";

// ── Shared rendering ─────────────────────────────────────────────────────
//
// The two replay routes below both fetch a single game log and hand it
// to `def.replayComponent`. The fetching surface differs (a stored
// replay-id vs. a tournament-id + game-index), but the post-fetch UI is
// identical: loading state, error state, optional "back" anchor. Kept in
// one helper so the two routes diverge only on the fetch.

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

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-fg-muted">
        Loading replay…
      </div>
    );
  }

  if (error || !log) {
    return (
      <div className="mx-auto flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-rose-300">
          {error instanceof Error ? error.message : "Replay could not be loaded."}
        </p>
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
    <Suspense fallback={null}>
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

  if (!def.hasMatchHistory || !def.replayComponent) {
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

// ── Tournament replay ────────────────────────────────────────────────────
//
// `/play/:slug/tournament/:strategyA/:strategyB/:tournamentId/:gameIndex`.
// Fetches the single game at `gameIndex` within the tournament via
// `apiClient.getTournamentGame`. The TournamentMatchHistory table
// navigates here when a row is clicked; back returns to that table.

export function TournamentReplayRoute() {
  const { def } = useGameShell();
  const params = useParams<{
    strategyA: string;
    strategyB: string;
    tournamentId: string;
    gameIndex: string;
  }>();
  const gameIndex = Number.parseInt(params.gameIndex ?? "", 10);
  const valid = Number.isFinite(gameIndex) && gameIndex >= 0 && !!params.tournamentId;

  const query = useQuery({
    queryKey: ["tournament-game", params.tournamentId, gameIndex],
    queryFn: () => apiClient.getTournamentGame(params.tournamentId ?? "", gameIndex),
    enabled: valid,
  });

  if (!def.hasTournament || !def.replayComponent) {
    return <Navigate to={`/play/${def.slug}`} replace />;
  }
  if (!valid) {
    return (
      <Navigate
        to={`/play/${def.slug}/tournament/${params.strategyA}/${params.strategyB}/${params.tournamentId}`}
        replace
      />
    );
  }

  const backHref = `/play/${def.slug}/tournament/${encodeURIComponent(params.strategyA ?? "")}/${encodeURIComponent(
    params.strategyB ?? "",
  )}/${encodeURIComponent(params.tournamentId ?? "")}`;

  return (
    <ReplayShell
      loading={query.isPending}
      error={query.error}
      log={query.data}
      backHref={backHref}
      backLabel="Back to match"
    />
  );
}
