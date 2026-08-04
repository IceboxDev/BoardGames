import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiClient } from "../../lib/api-client";
import { formatShortDate } from "../../lib/date-format.ts";
import { qk } from "../../lib/query-keys";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { LoadingState } from "../ui/LoadingState";
import { QueryBoundary } from "../ui/QueryBoundary";
import {
  formatDiff,
  type MatchColumn,
  type MatchOutcome,
  MatchResultsLayout,
  MatchResultsTable,
  MatchTally,
  ResultText,
  scoreToneClass,
} from "./MatchResultsTable";

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
  type Replay = (typeof replays)[number];

  const wins = replays.filter((r) => r.winner === "p0").length;
  const losses = replays.filter((r) => r.winner === "p1").length;
  const draws = replays.filter((r) => r.winner === "draw").length;

  const outcomeOf = (r: Replay): MatchOutcome =>
    r.winner === "p0" ? "win" : r.winner === "p1" ? "loss" : "draw";
  const invert = (o: MatchOutcome): MatchOutcome =>
    o === "win" ? "loss" : o === "loss" ? "win" : "draw";

  const columns: MatchColumn<Replay>[] = [
    {
      id: "n",
      header: "#",
      cellClassName: "tabular-nums text-fg-secondary",
      cell: (_r, i) => i + 1,
    },
    {
      id: "opponent",
      header: opponentLabel,
      cellClassName: "text-xs text-fg-secondary",
      cell: (r) => (r.aiEngine ? labelResolver(r.aiEngine) : "Human"),
    },
    {
      id: "you",
      header: "You",
      align: "right",
      cellClassName: (r) => `tabular-nums font-semibold ${scoreToneClass(outcomeOf(r))}`,
      cell: (r) => r.scoreP0 ?? "—",
    },
    {
      id: "opp",
      header: "Opp",
      align: "right",
      cellClassName: (r) => `tabular-nums font-semibold ${scoreToneClass(invert(outcomeOf(r)))}`,
      cell: (r) => r.scoreP1 ?? "—",
    },
    {
      id: "diff",
      header: "Diff",
      align: "right",
      cellClassName: "tabular-nums text-fg-muted",
      cell: (r) => formatDiff((r.scoreP0 ?? 0) - (r.scoreP1 ?? 0)),
    },
    {
      id: "result",
      header: "Result",
      align: "center",
      cellClassName: "text-xs",
      cell: (r) => {
        const o = outcomeOf(r);
        return (
          <ResultText outcome={o}>
            {o === "win" ? "Win" : o === "loss" ? "Loss" : "Draw"}
          </ResultText>
        );
      },
    },
    {
      id: "date",
      header: "Date",
      align: "right",
      cellClassName: "text-xs text-fg-muted",
      cell: (r) => formatShortDate(r.createdAt),
    },
  ];

  return (
    <MatchResultsLayout
      title="Match History"
      tally={
        replaysQuery.data && (
          <MatchTally total={replays.length} wins={wins} losses={losses} draws={draws} />
        )
      }
      footer={
        <Button variant="link" onClick={onBack} className="mt-2 text-sm">
          Back
        </Button>
      }
    >
      <QueryBoundary
        query={replaysQuery}
        loading={<LoadingState />}
        isEmpty={(rows) => rows.length === 0}
        empty={<EmptyState title="No games played yet" description="Play a game first." />}
      >
        {(rows) => (
          <MatchResultsTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            onSelectRow={onSelectReplay ? (r) => onSelectReplay(r.id) : undefined}
          />
        )}
      </QueryBoundary>
    </MatchResultsLayout>
  );
}
