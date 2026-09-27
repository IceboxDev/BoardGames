import type { GameManifest } from "@boardgames/core/machines/manifest";
import { seatPlacement, seatResult, seatScore } from "@boardgames/core/machines/outcome";
import type { MatchSummary } from "@boardgames/core/protocol";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../lib/api-client";
import { formatShortDate } from "../../lib/date-format.ts";
import { ordinal } from "../../lib/match-result-badge";
import { qk } from "../../lib/query-keys";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { LoadingState } from "../ui/LoadingState";
import { QueryBoundary } from "../ui/QueryBoundary";
import {
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
  /** Names the AI seats (strategy id → label). */
  manifest: GameManifest;
  onBack: () => void;
  /**
   * Called with the row's replay id when the user picks a game. The route
   * navigates to `/play/:slug/match-history/:replayId`, so refresh, share and
   * bookmark all survive. Omit when the game has no replay viewer.
   */
  onSelectReplay?: (replayId: number) => void;
}

/** The viewer's result in one game — every row has one, legacy rows at seat 0. */
function resultOf(match: MatchSummary): MatchOutcome {
  return match.viewerSeat === null ? "draw" : seatResult(match.outcome, match.viewerSeat);
}

/** "Win" at two seats; the place ("2nd of 4") at more; the team's or crew's result otherwise. */
function resultLabel(match: MatchSummary): string {
  const result = resultOf(match);
  const word = result === "win" ? "Win" : result === "loss" ? "Loss" : "Draw";
  const { outcome, viewerSeat, playerCount } = match;
  if (viewerSeat === null) return "—";
  if (outcome.kind === "coop") return outcome.won ? "Won together" : "Lost together";
  if (outcome.kind === "teams") return result === "draw" ? "Draw" : `Team ${word.toLowerCase()}`;
  const place = seatPlacement(outcome, viewerSeat);
  return playerCount > 2 && place !== null && result !== "draw"
    ? `${ordinal(place)} of ${playerCount}`
    : word;
}

/** Everyone at the table, the viewer as "You", AI seats by their strategy's name. */
function tableLabel(match: MatchSummary, manifest: GameManifest): string {
  if (match.seats.length === 0) return "—";
  return match.seats
    .map((seat) => {
      if (seat.isViewer) return "You";
      if (seat.kind === "human") return seat.name ?? "Player";
      const strategy = manifest.strategies.find((s) => s.id === seat.strategy);
      return `${strategy?.label ?? seat.strategy ?? "AI"} (AI)`;
    })
    .join(" · ");
}

export default function MatchHistory({
  gameSlug,
  manifest,
  onBack,
  onSelectReplay,
}: MatchHistoryProps) {
  const query = useQuery({
    queryKey: qk.gameReplays(gameSlug),
    queryFn: ({ signal }) => apiClient.getGameReplays(gameSlug, signal),
  });
  const matches = query.data ?? [];
  const tally = (kind: MatchOutcome) => matches.filter((m) => resultOf(m) === kind).length;

  const columns: MatchColumn<MatchSummary>[] = [
    {
      id: "n",
      header: "#",
      cellClassName: "tabular-nums text-fg-secondary",
      cell: (_m, i) => i + 1,
    },
    {
      id: "result",
      header: "Result",
      cellClassName: "text-xs font-semibold",
      cell: (m) => <ResultText outcome={resultOf(m)}>{resultLabel(m)}</ResultText>,
    },
    {
      id: "score",
      header: "Score",
      align: "right",
      cellClassName: (m) => `tabular-nums font-semibold ${scoreToneClass(resultOf(m))}`,
      cell: (m) => (m.viewerSeat === null ? "—" : (seatScore(m.outcome, m.viewerSeat) ?? "—")),
    },
    {
      id: "table",
      header: "Table",
      cellClassName: "text-xs text-fg-secondary",
      cell: (m) => tableLabel(m, manifest),
    },
    {
      id: "date",
      header: "Date",
      align: "right",
      cellClassName: "text-xs text-fg-muted",
      cell: (m) => formatShortDate(m.createdAt),
    },
  ];

  return (
    <MatchResultsLayout
      title="Match History"
      tally={
        query.data && (
          <MatchTally
            total={matches.length}
            wins={tally("win")}
            losses={tally("loss")}
            draws={tally("draw")}
          />
        )
      }
      footer={
        <Button variant="link" onClick={onBack} className="mt-2 text-sm">
          Back
        </Button>
      }
    >
      <QueryBoundary
        query={query}
        loading={<LoadingState />}
        isEmpty={(rows) => rows.length === 0}
        empty={<EmptyState title="No games played yet" description="Play a game first." />}
      >
        {(rows) => (
          <MatchResultsTable
            columns={columns}
            rows={rows}
            rowKey={(m) => m.id}
            onSelectRow={onSelectReplay ? (m) => onSelectReplay(m.id) : undefined}
          />
        )}
      </QueryBoundary>
    </MatchResultsLayout>
  );
}
