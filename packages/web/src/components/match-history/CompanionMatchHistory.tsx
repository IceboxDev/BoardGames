import type { CompanionRecord, CompanionRecordSlug } from "@boardgames/core/protocol";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { companionRecordsQueryFn, useCompanionRecordOutbox } from "../../lib/companion-records";
import { qk } from "../../lib/query-keys";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { LoadingState } from "../ui/LoadingState";
import { Modal, ModalBody } from "../ui/Modal";
import { QueryBoundary } from "../ui/QueryBoundary";
import type { CompanionRow } from "./companion-columns";
import { type MatchColumn, MatchResultsLayout, MatchResultsTable } from "./MatchResultsTable";

// Match History for the table companions (the Clocktower Grimoire, the D&D DM
// screen): games the member RAN, saved by their device when each ended. Same
// layout and table kit as the online games' history; each game supplies its
// columns, its summary line and the detail shown when a row is picked.

export default function CompanionMatchHistory<R extends CompanionRecord>({
  slug,
  select,
  columns,
  summary,
  detail,
  emptyDescription,
  onBack,
}: {
  slug: CompanionRecordSlug;
  /** Narrows a stored record to this game's shape (`null` drops it). */
  select: (record: CompanionRecord) => R | null;
  columns: MatchColumn<CompanionRow<R>>[];
  /** The line under the heading ("12 games · Good 7 / Evil 5"). */
  summary: (rows: readonly CompanionRow<R>[]) => ReactNode;
  /** The picked row's dialog. */
  detail: (row: CompanionRow<R>) => { title: ReactNode; eyebrow?: ReactNode; body: ReactNode };
  emptyDescription: string;
  onBack: () => void;
}) {
  const { pendingCount } = useCompanionRecordOutbox();
  const query = useQuery({
    queryKey: qk.companionRecords(slug),
    queryFn: companionRecordsQueryFn(slug),
    select: (entries) =>
      entries.flatMap((entry): CompanionRow<R>[] => {
        const record = select(entry.record);
        return record ? [{ ...entry, record }] : [];
      }),
  });
  const { refetch } = query;
  // A queued game just reached the server: show it.
  const [lastPending, setLastPending] = useState(pendingCount);
  useEffect(() => {
    if (pendingCount < lastPending) void refetch();
    setLastPending(pendingCount);
  }, [pendingCount, lastPending, refetch]);

  const [picked, setPicked] = useState<CompanionRow<R> | null>(null);
  const shown = picked ? detail(picked) : null;

  const numbered: MatchColumn<CompanionRow<R>>[] = [
    {
      id: "n",
      header: "#",
      cellClassName: "tabular-nums text-fg-secondary",
      cell: (_row, i) => i + 1,
    },
    ...columns,
  ];

  return (
    <MatchResultsLayout
      title="Match History"
      tally={
        <>
          {query.data && query.data.length > 0 && (
            <p className="mt-2 text-sm text-fg-secondary">{summary(query.data)}</p>
          )}
          {pendingCount > 0 && (
            <p className="mt-1 text-xs text-fg-muted">
              {pendingCount === 1
                ? "1 game is waiting to sync — it is saved on this device."
                : `${pendingCount} games are waiting to sync — they are saved on this device.`}
            </p>
          )}
        </>
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
        empty={<EmptyState title="Nothing recorded yet" description={emptyDescription} />}
      >
        {(rows) => (
          <MatchResultsTable
            columns={numbered}
            rows={rows}
            rowKey={(row) => row.id}
            onSelectRow={setPicked}
          />
        )}
      </QueryBoundary>
      {shown && (
        <Modal
          size="sm"
          onClose={() => setPicked(null)}
          eyebrow={shown.eyebrow}
          title={shown.title}
        >
          <ModalBody>{shown.body}</ModalBody>
        </Modal>
      )}
    </MatchResultsLayout>
  );
}
