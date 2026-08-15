import { DECRYPTO_AI_MODELS } from "@boardgames/core/games/decrypto/ai/models";
import type { ReplaySummary } from "@boardgames/core/protocol/http/games";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  type MatchColumn,
  MatchResultsLayout,
  MatchResultsTable,
} from "../../../components/match-history/MatchResultsTable";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingState } from "../../../components/ui/LoadingState";
import { QueryBoundary } from "../../../components/ui/QueryBoundary";
import { apiClient } from "../../../lib/api-client";
import { cn } from "../../../lib/cn";
import { formatShortDate } from "../../../lib/date-format";
import { qk } from "../../../lib/query-keys";

// Bespoke `/play/decrypto/match-history`. The generic <MatchHistory> table is
// built for two-seat games — "You" = p0, "Opponent" = p1 — which is nonsense
// for a team game: p0/p1 are the TEAMS (White/Black, or Team/Interceptor in
// the 3-player variant, distinguished by playerCount === 3), and the replay
// rows don't record which seat was the human. So this view names the winning
// SIDE instead of pretending a perspective, and scores are the points tally
// (interceptions − miscommunications) per side.

function modelLabel(id: string | null): string {
  if (!id) return "Humans only";
  return DECRYPTO_AI_MODELS.find((m) => m.id === id)?.label ?? id;
}

function isInterceptorRow(r: ReplaySummary): boolean {
  return r.playerCount === 3;
}

function sideName(r: ReplaySummary, side: 0 | 1): string {
  if (isInterceptorRow(r)) return side === 0 ? "Team" : "Interceptor";
  return side === 0 ? "White" : "Black";
}

function winnerText(r: ReplaySummary): { label: string; tone: string } {
  if (r.winner === "p0") return { label: `${sideName(r, 0)} won`, tone: "text-emerald-300" };
  if (r.winner === "p1") return { label: `${sideName(r, 1)} won`, tone: "text-sky-300" };
  return { label: "Shared victory", tone: "text-amber-300" };
}

export default function DecryptoMatchHistory({ onBack }: { onBack: () => void }) {
  const replaysQuery = useQuery({
    queryKey: qk.gameReplays("decrypto"),
    queryFn: ({ signal }) => apiClient.getGameReplays("decrypto", signal),
  });
  const replays = useMemo(() => replaysQuery.data ?? [], [replaysQuery.data]);

  const tally = useMemo(() => {
    const white = replays.filter((r) => r.winner === "p0").length;
    const black = replays.filter((r) => r.winner === "p1").length;
    const shared = replays.length - white - black;
    return { white, black, shared };
  }, [replays]);

  const columns: MatchColumn<ReplaySummary>[] = [
    {
      id: "n",
      header: "#",
      cellClassName: "tabular-nums text-fg-secondary",
      cell: (_r, i) => i + 1,
    },
    {
      id: "mode",
      header: "Mode",
      cellClassName: "text-xs text-fg-secondary",
      cell: (r) => (isInterceptorRow(r) ? "Interceptor" : "2v2"),
    },
    {
      id: "ai",
      header: "GPT agents",
      cellClassName: "text-xs text-fg-secondary",
      cell: (r) => modelLabel(r.aiEngine),
    },
    {
      id: "points",
      header: "Points",
      align: "right",
      cellClassName: "tabular-nums text-xs text-fg-secondary",
      cell: (r) =>
        r.scoreP0 !== null && r.scoreP1 !== null
          ? `${sideName(r, 0)} ${r.scoreP0} · ${sideName(r, 1)} ${r.scoreP1}`
          : "—",
    },
    {
      id: "result",
      header: "Result",
      align: "center",
      cell: (r) => {
        const w = winnerText(r);
        return <span className={cn("text-xs font-semibold", w.tone)}>{w.label}</span>;
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
        replaysQuery.data && replays.length > 0 ? (
          <p className="text-xs text-fg-secondary">
            {replays.length} game{replays.length === 1 ? "" : "s"} · {tally.white} White/Team ·{" "}
            {tally.black} Black/Interceptor · {tally.shared} shared
          </p>
        ) : undefined
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
        {(rows) => <MatchResultsTable columns={columns} rows={rows} rowKey={(r) => r.id} />}
      </QueryBoundary>
    </MatchResultsLayout>
  );
}
