import { ResistanceReplayLogSchema } from "@boardgames/core/games/the-resistance/record";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { BoardFallback } from "../../../../components/RouteFallback";
import { ErrorAlert, PageMain } from "../../../../components/ui";
import { apiClient } from "../../../../lib/api-client";
import { SOLVER_BASE } from "../../logic/solver";
import { ReplayDashboard } from "../ResistanceReplay";

/** `solo/match/:replayId` — a finished online match in the Solver, with seat names. */
export default function MatchAnalysis() {
  const navigate = useNavigate();
  const replayId = Number.parseInt(useParams().replayId ?? "", 10);
  const log = useQuery({
    queryKey: ["game-replay", "the-resistance", replayId],
    queryFn: () => apiClient.getGameReplay("the-resistance", replayId),
    enabled: Number.isFinite(replayId),
  });
  const matches = useQuery({
    queryKey: ["game-replays", "the-resistance"],
    queryFn: ({ signal }) => apiClient.getGameReplays("the-resistance", signal),
  });

  if (log.isPending) return <BoardFallback label="Loading the match…" />;
  const parsed = ResistanceReplayLogSchema.safeParse(log.data);
  if (log.error || !parsed.success) {
    return (
      <PageMain width="md">
        <ErrorAlert message="That match couldn't be loaded." />
      </PageMain>
    );
  }
  const summary = matches.data?.find((m) => m.id === replayId);
  const names = summary?.seats
    .slice()
    .sort((a, b) => a.seat - b.seat)
    .map((s) => (s.isViewer ? "You" : (s.name ?? (s.kind === "ai" ? `Bot ${s.seat + 1}` : null))));
  return (
    <ReplayDashboard record={parsed.data} names={names} onBack={() => navigate(SOLVER_BASE)} />
  );
}
