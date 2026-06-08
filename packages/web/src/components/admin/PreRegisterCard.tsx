import type { OnlineMode } from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { games } from "../../games/registry";
import { useEditableList } from "../../hooks/useEditableList";
import { errorMessageOf } from "../../lib/error-message";
import { adminFetchPendingInventory, adminSavePendingInventory } from "../../lib/inventory";
import { qk } from "../../lib/query-keys";
import InventoryGrid from "../InventoryGrid";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { SegmentedControl } from "../ui/SegmentedControl";
import { ONLINE_MODE_OPTIONS } from "./online-mode-options";

/**
 * Admin-only "pre-register" queue — a slug list + online mode that gets
 * stamped onto the next user who registers. Same draft/save model as
 * `InventoryPanel`, with an extra "Clear queue" affordance and an
 * expand/collapse chrome so the card doesn't dominate the admin page when
 * nothing is queued.
 */
export function PreRegisterCard() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

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
    <div className="mb-6 overflow-hidden rounded-xl border border-accent-500/20 bg-surface-900">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-3xs font-semibold uppercase tracking-[0.25em] text-accent-400">
            Pre-register
          </p>
          <p className="mt-1 text-sm text-fg-secondary">
            {loading
              ? "Loading…"
              : queued === 0
                ? "No collection queued — the next signup will start with no games."
                : `${queued} ${queued === 1 ? "game" : "games"} queued — assigned to the next user who registers.`}
          </p>
        </div>
        <Chip
          pressed={expanded}
          tone="accent"
          size="xs"
          disabled={loading}
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0"
        >
          {expanded ? "Close" : "Manage"}
        </Chip>
      </div>
      {expanded && !loading && slugList.draft !== null && (
        <div className="space-y-3 border-t border-white/5 bg-surface-950/40 px-4 py-4">
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-[0.2em] text-fg-muted">Online mode</span>
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
          <InventoryGrid selected={slugList.draft} onToggle={slugList.toggle} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-fg-muted">
              {slugList.draft.length} of {games.length} selected
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
        </div>
      )}
    </div>
  );
}
