import type { MatchRecord } from "@boardgames/core/history/types";
import { Reorder, useDragControls } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { LockedDate } from "../../lib/calendar-locks";
import { GripVerticalIcon } from "../icons";
import { Button } from "../ui/Button";
import { MatchCard } from "./MatchCard";

type Props = {
  /** YYYY-MM-DD when grouped by lock; otherwise null + dayLabel for standalone day. */
  dateKey: string | null;
  /** Pre-formatted day label, used for both lock cards and standalone cards. */
  dayLabel: string;
  lock: LockedDate | null;
  matches: MatchRecord[];
  isAdmin: boolean;
  /** Logged-in user id — passed down so each match row can highlight you. */
  currentUserId: string | null;
  onAddMatch?: () => void;
  onEditMatch?: (m: MatchRecord) => void;
  onDeleteMatch?: (m: MatchRecord) => void;
  /** Admin-only: persist a new top-to-bottom ordering of this night's matches. */
  onReorder?: (orderedIds: number[]) => void;
};

export function NightCard({
  dateKey,
  dayLabel,
  lock,
  matches,
  isAdmin,
  currentUserId,
  onAddMatch,
  onEditMatch,
  onDeleteMatch,
  onReorder,
}: Props) {
  const subtitleBits: string[] = [];
  if (lock?.host?.name) subtitleBits.push(lock.host.name);
  if (lock?.eventTime) subtitleBits.push(lock.eventTime);

  return (
    <section className="rounded-xl border border-white/5 bg-surface-900/30 p-2.5">
      <header className="mb-1.5 flex items-baseline justify-between gap-3 px-1">
        <div className="flex min-w-0 flex-col items-start gap-y-0.5 sm:flex-row sm:items-baseline sm:gap-2">
          <h3 className="max-w-full truncate text-sm font-semibold text-fg-primary">{dayLabel}</h3>
          {subtitleBits.length > 0 && (
            <span className="max-w-full truncate text-xs text-fg-muted">
              {subtitleBits.join(" · ")}
            </span>
          )}
          {!dateKey && (
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-3xs uppercase tracking-wider text-fg-muted">
              standalone
            </span>
          )}
        </div>
        {isAdmin && onAddMatch && (
          <Button
            variant="ghost"
            size="xs"
            onClick={onAddMatch}
            className="shrink-0 text-accent-300 hover:bg-accent-500/10"
          >
            + Match
          </Button>
        )}
      </header>
      {/* Reorder is admin-only, scoped to real nights (dateKey), and pointless
          with fewer than two matches — every other case renders the plain list. */}
      {isAdmin && dateKey != null && onReorder && matches.length >= 2 ? (
        <ReorderableMatches
          matches={matches}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          onEditMatch={onEditMatch}
          onDeleteMatch={onDeleteMatch}
          onReorder={onReorder}
        />
      ) : (
        <div className="flex flex-col gap-1">
          {matches.map((m) => (
            <MatchCard
              key={m.id}
              match={m}
              isAdmin={isAdmin}
              currentUserId={currentUserId}
              onEdit={onEditMatch}
              onDelete={onDeleteMatch}
            />
          ))}
        </div>
      )}
    </section>
  );
}

const idsOf = (matches: MatchRecord[]): string => matches.map((m) => m.id).join(",");

function ReorderableMatches({
  matches,
  isAdmin,
  currentUserId,
  onEditMatch,
  onDeleteMatch,
  onReorder,
}: {
  matches: MatchRecord[];
  isAdmin: boolean;
  currentUserId: string | null;
  onEditMatch?: (m: MatchRecord) => void;
  onDeleteMatch?: (m: MatchRecord) => void;
  onReorder: (orderedIds: number[]) => void;
}) {
  // Local order makes dragging smooth; `orderRef` exposes the latest order to
  // the drag-end handler (the closure would otherwise be stale).
  const [order, setOrder] = useState<MatchRecord[]>(matches);
  const orderRef = useRef(order);
  orderRef.current = order;
  // Last ordering we've reconciled with the server, so we don't re-fire a
  // mutation for a drop that didn't actually move anything, and don't clobber
  // an identical incoming list mid-interaction.
  const committedRef = useRef(idsOf(matches));

  useEffect(() => {
    const incoming = idsOf(matches);
    committedRef.current = incoming;
    if (incoming !== idsOf(orderRef.current)) setOrder(matches);
  }, [matches]);

  function commit() {
    const ids = orderRef.current.map((m) => m.id);
    const key = ids.join(",");
    if (key === committedRef.current) return;
    committedRef.current = key;
    onReorder(ids);
  }

  return (
    <Reorder.Group
      as="div"
      axis="y"
      values={order}
      onReorder={setOrder}
      className="flex flex-col gap-1"
    >
      {order.map((m) => (
        <ReorderableRow
          key={m.id}
          match={m}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          onEdit={onEditMatch}
          onDelete={onDeleteMatch}
          onCommit={commit}
        />
      ))}
    </Reorder.Group>
  );
}

function ReorderableRow({
  match,
  isAdmin,
  currentUserId,
  onEdit,
  onDelete,
  onCommit,
}: {
  match: MatchRecord;
  isAdmin: boolean;
  currentUserId: string | null;
  onEdit?: (m: MatchRecord) => void;
  onDelete?: (m: MatchRecord) => void;
  onCommit: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      as="div"
      value={match}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onCommit}
      className="flex items-stretch gap-1"
    >
      {/* biome-ignore lint/correctness/noRestrictedElements: bespoke pointer-driven drag handle — not a click/keyboard Button */}
      <button
        type="button"
        aria-label="Drag to reorder"
        // `touch-none` stops a touch-drag on the handle from scrolling the page.
        onPointerDown={(e) => controls.start(e)}
        className="flex w-6 shrink-0 touch-none cursor-grab items-center justify-center rounded-md text-fg-disabled transition-colors hover:bg-white/5 hover:text-fg-muted active:cursor-grabbing"
      >
        <GripVerticalIcon className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <MatchCard
          match={match}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
    </Reorder.Item>
  );
}
