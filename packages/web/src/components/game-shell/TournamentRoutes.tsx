import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useGameShell } from "../../hooks/useGameShell";
import { TournamentComingSoon, TournamentGrid, TournamentMatchHistory } from "../tournament";

/**
 * Route element at `/play/:slug/tournament`. Renders the grid of
 * strategy match-ups; clicking a cell navigates to the detail route
 * for that match-up.
 *
 * Games without `hasTournament` bounce back to mode select (guards a stale
 * URL). Games that enable the tournament button but haven't defined their
 * `tournamentStrategies` yet get a "coming soon" placeholder instead.
 */
export function TournamentRoute() {
  const navigate = useNavigate();
  const { def } = useGameShell();

  if (!def.hasTournament) {
    return <Navigate to={`/play/${def.slug}`} replace />;
  }
  if (!def.tournamentStrategies) {
    return (
      <TournamentComingSoon gameTitle={def.title} onBack={() => navigate(`/play/${def.slug}`)} />
    );
  }

  return (
    <TournamentGrid
      gameSlug={def.slug}
      strategies={def.tournamentStrategies}
      showScoreDiff={def.tournamentShowScoreDiff}
      onViewMatchHistory={(aId, bId, tournamentId) => {
        navigate(
          `/play/${def.slug}/tournament/${encodeURIComponent(aId)}/${encodeURIComponent(bId)}/${encodeURIComponent(
            tournamentId,
          )}`,
        );
      }}
    />
  );
}

/**
 * Route element at
 * `/play/:slug/tournament/:strategyA/:strategyB/:tournamentId`. Wraps
 * the generic `<TournamentMatchHistory>` table; clicking a row
 * navigates to the sibling replay URL
 * `/play/:slug/tournament/:strategyA/:strategyB/:tournamentId/:gameIndex`
 * where `<TournamentReplayRoute>` fetches and renders the log.
 *
 * URL params are decoded by the router on the way in — strategy ids
 * are usually `^[a-z0-9-]+$` but tournament ids are server-generated
 * and could theoretically contain reserved characters.
 */
export function TournamentMatchHistoryRoute() {
  const navigate = useNavigate();
  const { def } = useGameShell();
  const params = useParams<{ strategyA: string; strategyB: string; tournamentId: string }>();

  if (!def.hasTournament || !def.tournamentStrategies) {
    return <Navigate to={`/play/${def.slug}`} replace />;
  }
  if (!params.strategyA || !params.strategyB || !params.tournamentId) {
    return <Navigate to={`/play/${def.slug}/tournament`} replace />;
  }

  const a = encodeURIComponent(params.strategyA);
  const b = encodeURIComponent(params.strategyB);
  const t = encodeURIComponent(params.tournamentId);

  return (
    <TournamentMatchHistory
      strategies={def.tournamentStrategies}
      strategyAId={params.strategyA}
      strategyBId={params.strategyB}
      tournamentId={params.tournamentId}
      onBack={() => navigate(`/play/${def.slug}/tournament`)}
      onSelectGameIndex={
        def.replayComponent
          ? (gameIndex) => navigate(`/play/${def.slug}/tournament/${a}/${b}/${t}/${gameIndex}`)
          : undefined
      }
      exportLogFn={def.tournamentExportLogFn}
    />
  );
}
