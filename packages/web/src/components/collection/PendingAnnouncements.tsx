import type { Announcement } from "@boardgames/core/protocol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { retractAnnouncement } from "../../lib/collection.ts";
import { formatRelativeTime } from "../../lib/date-format.ts";
import { qk } from "../../lib/query-keys.ts";
import { resolveInventoryEntry } from "../../lib/resolve-inventory-entry.ts";
import { Badge } from "../ui/Badge.tsx";
import { Button } from "../ui/Button.tsx";
import { Surface } from "../ui/Surface.tsx";
import { useConfirm } from "../ui/useConfirm.tsx";

// Amber strip above the collection table: the owner's announcements awaiting
// an admin. Pending rows can be retracted; recently-resolved rows show their
// outcome for a while (server returns the latest 25).

function announcementTitle(a: Announcement): string {
  if (a.slug) return resolveInventoryEntry(a.slug).title;
  return `“${a.freeTextName ?? "Unknown"}”`;
}

export function PendingAnnouncements({
  userId,
  announcements,
}: {
  userId: string;
  announcements: readonly Announcement[];
}) {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();

  const retract = useMutation({
    mutationFn: (id: string) => retractAnnouncement(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.collection(userId) }),
  });

  const pending = announcements.filter((a) => a.status === "pending");
  const resolved = announcements.filter((a) => a.status !== "pending").slice(0, 3);
  if (pending.length === 0 && resolved.length === 0) return null;

  return (
    <Surface
      variant="raised"
      padding="none"
      className="space-y-2 border-amber-400/20 bg-amber-500/[0.04] p-4"
    >
      <p className="text-2xs font-bold uppercase tracking-pill text-amber-200">
        Ownership announcements
      </p>
      <ul className="space-y-1.5">
        {pending.map((a) => (
          <li key={a.id} className="flex items-center gap-2.5 text-sm">
            <Badge tone="amber" size="xs">
              Pending
            </Badge>
            <span className="min-w-0 flex-1 truncate text-fg-primary">
              {announcementTitle(a)}
              {a.note && <span className="text-fg-muted"> — {a.note}</span>}
            </span>
            <span className="shrink-0 text-3xs text-fg-muted">
              {formatRelativeTime(a.createdAt)}
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={async () => {
                const ok = await confirm({
                  title: "Retract this announcement?",
                  description: `${announcementTitle(a)} will be removed from the admin queue.`,
                  confirmLabel: "Retract",
                });
                if (ok) retract.mutate(a.id);
              }}
            >
              Retract
            </Button>
          </li>
        ))}
        {resolved.map((a) => (
          <li key={a.id} className="flex items-center gap-2.5 text-sm">
            <Badge tone={a.status === "approved" ? "emerald" : "neutral"} size="xs">
              {a.status === "approved" ? "Approved" : "Dismissed"}
            </Badge>
            <span className="min-w-0 flex-1 truncate text-fg-muted">{announcementTitle(a)}</span>
            <span className="shrink-0 text-3xs text-fg-muted">
              {a.resolvedAt ? formatRelativeTime(a.resolvedAt) : ""}
            </span>
          </li>
        ))}
      </ul>
      {confirmDialog}
    </Surface>
  );
}
