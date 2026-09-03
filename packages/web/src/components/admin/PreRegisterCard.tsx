import { CARD_DECKS, isDeckGameSlug } from "@boardgames/core/games/card-decks";
import { EXIT_CATALOG_SLUG, EXIT_GAMES } from "@boardgames/core/games/exit-games";
import type { OnlineMode } from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { games } from "../../games/registry";
import { useEditableList } from "../../hooks/useEditableList";
import { errorMessageOf } from "../../lib/error-message";
import { adminFetchPendingInventory, adminSavePendingInventory } from "../../lib/inventory";
import { qk } from "../../lib/query-keys";
import CardDeckList from "../CardDeckList";
import ExitBoxList from "../ExitBoxList";
import InventoryGrid from "../InventoryGrid";
import { Button } from "../ui/Button";
import { ErrorAlert } from "../ui/ErrorAlert";
import { SegmentedControl } from "../ui/SegmentedControl";
import { AdminSection } from "./AdminSection";
import { ONLINE_MODE_OPTIONS } from "./online-mode-options";

// Derived-ownership entries can't be stamped directly: the EXIT anchor is
// owned via boxes and traditional-deck card games via their deck, so the
// queue offers `CardDeckList` / `ExitBoxList` toggles instead of grid cells.
const ownableGames = games.filter((g) => g.slug !== EXIT_CATALOG_SLUG && !isDeckGameSlug(g.slug));

/**
 * Admin-only "pre-register" queue — a slug list + online mode that gets
 * stamped onto the next user who registers. Same draft/save model as
 * `InventoryPanel`, with an extra "Clear queue" affordance. Fills its own
 * admin tab, so it renders open.
 */
export function PreRegisterCard() {
  const queryClient = useQueryClient();

  const pendingQuery = useQuery({
    queryKey: qk.adminPendingInventory(),
    queryFn: ({ signal }) => adminFetchPendingInventory(signal),
  });

  const slugList = useEditableList<string>(pendingQuery.data?.slugs);
  // Online mode lives outside useEditableList because it isn't a list.
  // Mirrors useEditableList's "sync once per loaded value" pattern so that a
  // background refetch (window focus etc.) doesn't blow away an in-flight
  // user edit. The ref records the last value we synced FROM so the effect
  // becomes a no-op when react-query hands back identical data.
  const [draftMode, setDraftMode] = useState<OnlineMode | null>(null);
  const lastSyncedMode = useRef<OnlineMode | undefined>(undefined);
  const committedMode = pendingQuery.data?.onlineMode ?? "offline";
  useEffect(() => {
    const loaded = pendingQuery.data?.onlineMode;
    if (loaded === undefined) return;
    if (lastSyncedMode.current === loaded) return;
    lastSyncedMode.current = loaded;
    setDraftMode(loaded);
  }, [pendingQuery.data?.onlineMode]);

  const saveMutation = useMutation({
    mutationFn: (payload: { slugs: string[]; onlineMode: OnlineMode }) =>
      adminSavePendingInventory(payload),
    onSuccess: (_data, payload) => {
      queryClient.setQueryData(qk.adminPendingInventory(), payload);
      setDraftMode(payload.onlineMode);
    },
  });

  const error =
    errorMessageOf(pendingQuery.error, "Failed to load") ??
    errorMessageOf(saveMutation.error, "Save failed");

  const loading = pendingQuery.isPending;
  const saving = saveMutation.isPending;
  const queued = slugList.committed.length;
  const activeMode = draftMode ?? committedMode;
  const modeDirty = draftMode !== null && draftMode !== committedMode;
  const isDirty = slugList.isDirty || modeDirty;

  function save() {
    if (slugList.draft === null) return;
    saveMutation.mutate({ slugs: slugList.draft, onlineMode: activeMode });
  }

  function clearQueue() {
    // Both the persistent state AND the local draft should reset to empty +
    // default mode, so the user immediately sees the cleared queue.
    saveMutation.mutate({ slugs: [], onlineMode: "offline" });
    slugList.replace([]);
    setDraftMode("offline");
  }

  return (
    <AdminSection
      tone="accent"
      eyebrow="Pre-register"
      summary={
        loading
          ? "Loading…"
          : queued === 0
            ? "No collection queued — the next signup will start with no games."
            : `${queued} ${queued === 1 ? "game" : "games"} queued — assigned to the next user who registers.`
      }
    >
      {!loading && slugList.draft !== null ? (
        <>
          {error && <ErrorAlert message={error} />}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-eyebrow text-fg-muted">Online mode</span>
            <SegmentedControl<OnlineMode>
              options={ONLINE_MODE_OPTIONS}
              value={activeMode}
              onChange={setDraftMode}
              shape="pill"
              size="sm"
              selectionMode="toggle"
              tone="accent"
              disabled={saving}
              aria-label="Pre-register online mode"
            />
          </div>
          <InventoryGrid
            selected={slugList.draft}
            onToggle={slugList.toggle}
            games={ownableGames}
          />
          <CardDeckList selected={slugList.draft} onToggle={slugList.toggle} />
          <ExitBoxList selected={slugList.draft} onToggle={slugList.toggle} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-fg-muted">
              {slugList.draft.length} of{" "}
              {ownableGames.length + CARD_DECKS.length + EXIT_GAMES.length} selected
            </span>
            <div className="flex items-center gap-2">
              {(queued > 0 || committedMode !== "offline") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearQueue}
                  loading={saving}
                  disabled={saving}
                >
                  Clear queue
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={save}
                loading={saving}
                disabled={!isDirty || saving}
              >
                Save queue
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </AdminSection>
  );
}
