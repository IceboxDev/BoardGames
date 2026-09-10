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
import { AdminSection } from "./AdminSection.tsx";

// Pending ownership announcements — the admin side of "Announce a game".
// An announcement that names a catalog game approves in ONE click from the
// row: the announcer already picked the game, so the admin only confirms it.
// The picker modal is reserved for the two cases where the admin has to
// choose: a free-text announcement ("Approve" must map the words to a slug)
// and the rare mismatch on a named game ("Change" re-maps before stamping).
// Approve-custom turns a free-text name into a custom collection item;
// dismiss just closes it. Lives at the top of the Users tab (it's a
// per-user queue) and only exists while something is pending.

function announcedTitle(a: Announcement): string {
  if (a.slug) return resolveInventoryEntry(a.slug).title;
  return `“${a.freeTextName ?? "Unknown"}”`;
}

export function AnnouncementsCard() {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  /** Announcement open in the picker modal (free-text approve, or "Change"). */
  const [picking, setPicking] = useState<Announcement | null>(null);
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
      closePicker();
    },
  });

  // Only the button that fired the in-flight resolve spins; the queue holds
  // several announcements and a shared `isPending` lit every row at once.
  const busy = (a: Announcement, action: ResolveAnnouncementBody["action"]) =>
    resolveMutation.isPending &&
    resolveMutation.variables?.a.id === a.id &&
    resolveMutation.variables.body.action === action;

  function openPicker(a: Announcement) {
    setPicking(a);
    setPickedSlug(a.slug);
  }
  function closePicker() {
    setPicking(null);
    setPickedSlug(null);
  }

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
      <AdminSection tone="amber" eyebrow="Ownership announcements" summary={summary}>
        {error && <ErrorAlert message={error} />}
        <ul className="space-y-2">
          {announcements.map((a) => {
            // Bound to a const so the narrowing survives into the click handler.
            const slug = a.slug;
            return (
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
                  {slug !== null ? (
                    <>
                      <Button
                        variant="primary"
                        size="xs"
                        loading={busy(a, "approve")}
                        onClick={() =>
                          resolveMutation.mutate({ a, body: { action: "approve", slug } })
                        }
                      >
                        Approve
                      </Button>
                      <Button variant="ghost" size="xs" onClick={() => openPicker(a)}>
                        Change
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="primary" size="xs" onClick={() => openPicker(a)}>
                        Approve
                      </Button>
                      <Button
                        variant="secondary"
                        size="xs"
                        loading={busy(a, "approve-custom")}
                        onClick={() =>
                          resolveMutation.mutate({ a, body: { action: "approve-custom" } })
                        }
                      >
                        As custom
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="xs"
                    loading={busy(a, "dismiss")}
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
            );
          })}
        </ul>
      </AdminSection>

      {picking && (
        <Modal
          onClose={closePicker}
          eyebrow="Ownership announcements"
          title={`Approve for ${picking.userName ?? "user"}`}
          subheader={
            picking.freeTextName
              ? `They wrote: “${picking.freeTextName}” — pick the matching game.`
              : `They announced ${announcedTitle(picking)} — pick the game to stamp instead.`
          }
          size="md"
        >
          <ModalBody className="space-y-2">
            <GamePicker pickedSlug={pickedSlug} onPick={setPickedSlug} />
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={closePicker}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!pickedSlug}
              loading={busy(picking, "approve")}
              onClick={() =>
                pickedSlug &&
                resolveMutation.mutate({
                  a: picking,
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
