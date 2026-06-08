import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { games } from "../../games/registry";
import { useEditableList } from "../../hooks/useEditableList";
import { errorMessageOf } from "../../lib/error-message";
import { adminFetchInventory, adminSaveInventory } from "../../lib/inventory";
import { qk } from "../../lib/query-keys";
import InventoryGrid from "../InventoryGrid";
import { Button, LoadingState } from "../ui";

type Props = { userId: string };

/**
 * Per-user owned-games editor. Drafts a slug list locally via
 * `useEditableList` so the user can toggle freely before committing. On
 * save we push to both the admin-scoped cache key and invalidate the
 * user-facing key so their own inventory view picks up the change without
 * a manual refetch.
 */
export function InventoryPanel({ userId }: Props) {
  const queryClient = useQueryClient();

  const inventoryQuery = useQuery({
    queryKey: qk.adminUserInventory(userId),
    queryFn: ({ signal }) => adminFetchInventory(userId, signal),
  });

  const list = useEditableList<string>(inventoryQuery.data);

  const saveMutation = useMutation({
    mutationFn: (slugs: string[]) => adminSaveInventory(userId, slugs),
    onSuccess: (_data, slugs) => {
      queryClient.setQueryData(qk.adminUserInventory(userId), slugs);
      void queryClient.invalidateQueries({ queryKey: qk.inventory(userId) });
    },
  });

  const error =
    errorMessageOf(inventoryQuery.error, "Failed to load") ??
    errorMessageOf(saveMutation.error, "Save failed");

  if (inventoryQuery.isPending || !list.isReady || list.draft === null) {
    return <LoadingState label="Loading inventory…" className="justify-start py-3" />;
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <InventoryGrid selected={list.draft} onToggle={list.toggle} />
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-fg-muted">
          {list.draft.length} of {games.length} selected
        </span>
        <Button
          variant="primary"
          size="sm"
          onClick={() => list.draft && saveMutation.mutate(list.draft)}
          loading={saveMutation.isPending}
          disabled={!list.isDirty}
        >
          Save inventory
        </Button>
      </div>
    </div>
  );
}
