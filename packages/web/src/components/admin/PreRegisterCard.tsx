import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { games } from "../../games/registry";
import { useEditableList } from "../../hooks/useEditableList";
import { errorMessageOf } from "../../lib/error-message";
import { adminFetchPendingInventory, adminSavePendingInventory } from "../../lib/inventory";
import { qk } from "../../lib/query-keys";
import InventoryGrid from "../InventoryGrid";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";

/**
 * Admin-only "pre-register" queue — a slug list that gets stamped onto the
 * next user who registers. Same draft/save model as `InventoryPanel`, with
 * an extra "Clear queue" affordance and an expand/collapse chrome so the
 * card doesn't dominate the admin page when nothing is queued.
 */
export function PreRegisterCard() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const pendingQuery = useQuery({
    queryKey: qk.adminPendingInventory(),
    queryFn: ({ signal }) => adminFetchPendingInventory(signal),
  });

  const list = useEditableList<string>(pendingQuery.data);

  const saveMutation = useMutation({
    mutationFn: (slugs: string[]) => adminSavePendingInventory(slugs),
    onSuccess: (_data, slugs) => {
      queryClient.setQueryData(qk.adminPendingInventory(), slugs);
    },
  });

  const error =
    errorMessageOf(pendingQuery.error, "Failed to load") ??
    errorMessageOf(saveMutation.error, "Save failed");

  const loading = pendingQuery.isPending;
  const saving = saveMutation.isPending;
  const queued = list.committed.length;

  function save() {
    if (list.draft !== null) saveMutation.mutate(list.draft);
  }

  function clearQueue() {
    // Both the persistent state AND the local draft should reset to empty,
    // so the user immediately sees the cleared list (the success callback
    // updates committed via setQueryData but doesn't touch the draft).
    saveMutation.mutate([]);
    list.replace([]);
  }

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-accent-500/20 bg-surface-900">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-accent-400">
            Pre-register
          </p>
          <p className="mt-1 text-sm text-gray-300">
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
      {expanded && !loading && list.draft !== null && (
        <div className="space-y-3 border-t border-white/5 bg-surface-950/40 px-4 py-4">
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <InventoryGrid selected={list.draft} onToggle={list.toggle} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-500">
              {list.draft.length} of {games.length} selected
            </span>
            <div className="flex items-center gap-2">
              {queued > 0 && (
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
                disabled={!list.isDirty || saving}
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
