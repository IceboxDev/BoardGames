import { TournamentResultsSchema } from "@boardgames/core/tournament/results";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { useGameShell } from "../../hooks/useGameShell";
import { qk } from "../../lib/query-keys";
import { TournamentResultsView } from "../tournament";
import { QueryBoundary } from "../ui/QueryBoundary";

/**
 * `/play/:slug/tournament` — the results of the game's locally run AI
 * tournament, loaded from the bundle and checked against the shared schema.
 * Games without results bounce back to mode select (a stale URL).
 */
export default function TournamentRoute() {
  const navigate = useNavigate();
  const { def } = useGameShell();
  const load = def.tournamentResults;
  const query = useQuery({
    queryKey: qk.tournamentResults(def.slug),
    queryFn: async () => TournamentResultsSchema.parse((await load?.())?.default),
    enabled: load !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (!load) return <Navigate to={`/play/${def.slug}`} replace />;
  return (
    <QueryBoundary query={query} loadingLabel="Loading results…">
      {(results) => (
        <TournamentResultsView results={results} onBack={() => navigate(`/play/${def.slug}`)} />
      )}
    </QueryBoundary>
  );
}
