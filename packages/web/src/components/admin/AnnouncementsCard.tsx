import type { Announcement, ResolveAnnouncementBody } from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { adminFetchAnnouncements, adminResolveAnnouncement } from "../../lib/collection.ts";
import { formatRelativeTime } from "../../lib/date-format.ts";
import { errorMessageOf } from "../../lib/error-message.ts";
import { qk } from "../../lib/query-keys.ts";
import { resolveInventoryEntry } from "../../lib/resolve-inventory-entry.ts";
import { GamePicker } from "../collection/GamePicker.tsx";
import { Button } from "../ui/Button.tsx";
import { ErrorAlert } from "../ui/ErrorAlert.tsx";
import { Modal, ModalBody, ModalFooter } from "../ui/Modal.tsx";
import { Surface } from "../ui/Surface.tsx";
import { useConfirm } from "../ui/useConfirm.tsx";
import { ExpandableAdminCard } from "./ExpandableAdminCard.tsx";

// Pending ownership announcements — the admin side of "Announce a game".
// Approve stamps the (possibly re-mapped) slug onto the announcer's
// inventory; approve-custom turns a free-text name into a custom collection
// item; dismiss just closes it. Same expandable-card chrome as the
// pre-register queue.

function announcedTitle(a: Announcement): string {
  if (a.slug) return resolveInventoryEntry(a.slug).title;
  return `“${a.freeTextName ?? "Unknown"}”`;
}

export function AnnouncementsCard() {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [expanded, setExpanded] = useState(false);
  /** Announcement currently in the approve-with-picker flow. */
  const [approving, setApproving] = useState<Announcement | null>(null);
  const [pickedSlug, setPickedSlug] = useState<string | null>(null);

  const query = useQuery({
    queryKey: qk.adminAnnouncements(),
    queryFn: ({ signal }) => adminFetchAnnouncements(signal),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ a, body }: { a: Announcement; body: ResolveAnnouncementBody }) =>
      adminResolveAnnouncement(a.id, body),
    onSuccess: (_data, { a, body }) => {
      void queryClient.invalidateQueries({ queryKey: qk.adminAnnouncements() });
      void queryClient.invalidateQueries({ queryKey: qk.collection(a.userId) });
      if (body.action === "approve") {
        // Ownership changed: refresh every cache that shows owned games.
        void queryClient.invalidateQueries({ queryKey: qk.adminUserInventory(a.userId) });
        void queryClient.invalidateQueries({ queryKey: qk.inventory(a.userId) });
        void queryClient.invalidateQueries({ queryKey: qk.profile(a.userId) });
        void queryClient.invalidateQueries({ queryKey: qk.players() });
      }
      setApproving(null);
      setPickedSlug(null);
    },
  });

  const announcements = query.data?.announcements ?? [];
  const error =
    errorMessageOf(query.error, "Failed to load") ??
    errorMessageOf(resolveMutation.error, "Resolve failed");

  // The card only exists while there is something to act on — an empty
  // approvals queue is not worth a permanent block on the admin page.
  if (announcements.length === 0) return null;

  const summary = `${announcements.length} pending — new acquisitions awaiting approval.`;

  return (
    <>
      <ExpandableAdminCard
        tone="amber"
        eyebrow="Ownership announcements"
        summary={summary}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        toggleDisabled={query.isPending}
      >
        {error && <ErrorAlert message={error} />}
        <ul className="space-y-2">
          {announcements.map((a) => (
            <Surface
              as="li"
              key={a.id}
              variant="tile"
              padding="none"
              className="flex flex-wrap items-center gap-2 px-3 py-2"
            >
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-semibold text-fg-primary">{a.userName ?? a.userId}</span>
                <span className="text-fg-secondary"> announced acquiring </span>
                <span className="font-semibold text-fg-primary">{announcedTitle(a)}</span>
                {a.note && <span className="block text-2xs text-fg-muted">{a.note}</span>}
                <span className="block text-3xs text-fg-muted">
                  {formatRelativeTime(a.createdAt)}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <Button
                  variant="primary"
                  size="xs"
                  onClick={() => {
                    setApproving(a);
                    setPickedSlug(a.slug);
                  }}
                >
                  Approve
                </Button>
                {a.freeTextName !== null && (
                  <Button
                    variant="secondary"
                    size="xs"
                    loading={resolveMutation.isPending}
                    onClick={() =>
                      resolveMutation.mutate({ a, body: { action: "approve-custom" } })
                    }
                  >
                    As custom
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={async () => {
                    const ok = await confirm({
                      title: "Dismiss this announcement?",
                      description: `${announcedTitle(a)} will not be added to ${a.userName ?? "the user"}'s collection.`,
                      confirmLabel: "Dismiss",
                    });
                    if (ok) resolveMutation.mutate({ a, body: { action: "dismiss" } });
                  }}
                >
                  Dismiss
                </Button>
              </span>
            </Surface>
          ))}
          {announcements.length === 0 && !query.isPending && (
            <li className="py-2 text-center text-xs text-fg-muted">Queue is empty.</li>
          )}
        </ul>
      </ExpandableAdminCard>

      {approving && (
        <Modal
          onClose={() => setApproving(null)}
          eyebrow="Ownership announcements"
          title={`Approve for ${approving.userName ?? "user"}`}
          subheader={
            approving.freeTextName
              ? `They wrote: “${approving.freeTextName}” — pick the matching game.`
              : undefined
          }
          size="md"
        >
          <ModalBody className="space-y-2">
            <GamePicker pickedSlug={pickedSlug} onPick={setPickedSlug} />
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={() => setApproving(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!pickedSlug}
              loading={resolveMutation.isPending}
              onClick={() =>
                pickedSlug &&
                resolveMutation.mutate({
                  a: approving,
                  body: { action: "approve", slug: pickedSlug },
                })
              }
            >
              Approve
            </Button>
          </ModalFooter>
        </Modal>
      )}
      {confirmDialog}
    </>
  );
}
