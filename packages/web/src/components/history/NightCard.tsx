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
  if (!dateKey) subtitleBits.push("No game night");

  return (
    <section>
      {/* The night's bar stays pinned under the top nav while its matches
          scroll past, so a long night never loses its date. */}
      <header className="sticky top-below-nav z-raised flex min-h-12 items-center justify-between gap-3 bg-surface-950/90 px-1 backdrop-blur">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="shrink-0 text-sm font-bold text-fg-strong">{dayLabel}</h3>
          {subtitleBits.length > 0 && (
            <span className="truncate text-xs text-fg-muted">{subtitleBits.join(" · ")}</span>
          )}
        </div>
        {isAdmin && onAddMatch && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onAddMatch}
            className="shrink-0 text-accent-300 hover:bg-accent-500/10"
          >
            + Match
          </Button>
        )}
      </header>
      <div className="overflow-hidden rounded-card-lg border border-line-soft bg-surface-900">
        {isAdmin && onReorder ? (
          <ReorderableMatches
            matches={matches}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            onEditMatch={onEditMatch}
            onDeleteMatch={onDeleteMatch}
            onReorder={onReorder}
          />
        ) : (
          <div className="flex flex-col divide-y divide-line-soft">
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
      </div>
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
    if (incoming !== idsOf(orderRef.current)) {
      setOrder(matches);
      return;
    }
    // Same ids in the same order — but an EDIT changes row content without
    // touching ids, so re-point every row at the fresh record. Skipping this
    // kept rendering the pre-edit outcome (and handed the stale record back
    // to the edit modal) until an id changed or the page reloaded. Preserves
    // object identity when nothing changed so drags don't re-render.
    const byId = new Map(matches.map((m) => [m.id, m] as const));
    setOrder((prev) => {
      const next = prev.map((m) => byId.get(m.id) ?? m);
      return next.every((m, i) => m === prev[i]) ? prev : next;
    });
  }, [matches]);

  function commit() {
    const ids = orderRef.current.map((m) => m.id);
    const key = ids.join(",");
    if (key === committedRef.current) return;
    committedRef.current = key;
    onReorder(ids);
  }

  // The touch-friendly path (and the keyboard one): swap with a neighbour.
  function move(index: number, by: -1 | 1) {
    const to = index + by;
    const current = orderRef.current;
    if (to < 0 || to >= current.length) return;
    const next = [...current];
    [next[index], next[to]] = [next[to], next[index]];
    orderRef.current = next;
    setOrder(next);
    commit();
  }

  return (
    <Reorder.Group
      as="div"
      axis="y"
      values={order}
      onReorder={setOrder}
      className="flex flex-col divide-y divide-line-soft"
    >
      {order.map((m, i) => (
        <ReorderableRow
          key={m.id}
          match={m}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          onEdit={onEditMatch}
          onDelete={onDeleteMatch}
          onCommit={commit}
          onMoveEarlier={i > 0 ? () => move(i, -1) : undefined}
          onMoveLater={i < order.length - 1 ? () => move(i, 1) : undefined}
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
  onMoveEarlier,
  onMoveLater,
}: {
  match: MatchRecord;
  isAdmin: boolean;
  currentUserId: string | null;
  onEdit?: (m: MatchRecord) => void;
  onDelete?: (m: MatchRecord) => void;
  onCommit: () => void;
  onMoveEarlier?: () => void;
  onMoveLater?: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      as="div"
      value={match}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onCommit}
      className="flex items-stretch bg-surface-900"
    >
      {/* Drag is a pointer nicety for wide screens; on a phone the row's
          Earlier / Later buttons reorder instead, so no grip eats the width. */}
      {/* biome-ignore lint/correctness/noRestrictedElements: bespoke pointer-driven drag handle — not a click/keyboard Button */}
      <button
        type="button"
        aria-label="Drag to reorder"
        // `touch-none` stops a touch-drag on the handle from scrolling the page.
        onPointerDown={(e) => controls.start(e)}
        className="hidden w-6 shrink-0 touch-none cursor-grab items-center justify-center text-fg-disabled transition-colors hover:bg-fill hover:text-fg-muted active:cursor-grabbing sm:flex"
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
          onMoveEarlier={onMoveEarlier}
          onMoveLater={onMoveLater}
        />
      </div>
    </Reorder.Item>
  );
}
