import { CARD_DECKS, isDeckGameSlug } from "@boardgames/core/games/card-decks";
import { EXIT_CATALOG_SLUG, EXIT_GAMES } from "@boardgames/core/games/exit-games";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { games } from "../../games/registry";
import { useEditableList } from "../../hooks/useEditableList";
import { errorMessageOf } from "../../lib/error-message";
import {
  adminFetchInventory,
  adminFetchNewSlugs,
  adminSaveInventory,
  adminSetInventoryNew,
} from "../../lib/inventory";
import { qk } from "../../lib/query-keys";
import CardDeckList from "../CardDeckList";
import ExitBoxList from "../ExitBoxList";
import InventoryGrid from "../InventoryGrid";
import { Button, Chip, ErrorAlert, LoadingState } from "../ui";

type Props = { userId: string };

// Derived-ownership entries are not toggleable cells here: the EXIT anchor is
// owned via boxes (`ExitBoxList`), and traditional-deck card games are owned
// via the French-/Bavarian-suited deck (`CardDeckList`).
const ownableGames = games.filter((g) => g.slug !== EXIT_CATALOG_SLUG && !isDeckGameSlug(g.slug));

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

  // "New in the library" per owned game — derived server-side from the copy's
  // acquisition date and the member's plays (see admin-inventory.ts), so the
  // toggle is immediate and separate from the drafted slug list: only a SAVED
  // game can be marked, and the frame it drives lives on the member's profile
  // and the night picker, whose caches are invalidated here.
  const newSlugsQuery = useQuery({
    queryKey: qk.adminUserNewSlugs(userId),
    queryFn: ({ signal }) => adminFetchNewSlugs(userId, signal),
  });
  const newMutation = useMutation({
    mutationFn: ({ slug, value }: { slug: string; value: boolean }) =>
      adminSetInventoryNew(userId, slug, value),
    onSuccess: (newSlugs) => {
      queryClient.setQueryData(qk.adminUserNewSlugs(userId), newSlugs);
      void queryClient.invalidateQueries({ queryKey: qk.collection(userId) });
      void queryClient.invalidateQueries({ queryKey: qk.profile(userId) });
      void queryClient.invalidateQueries({ queryKey: qk.availableGamesAll() });
    },
  });
  const saved = new Set(inventoryQuery.data ?? []);
  const newSet = new Set(newSlugsQuery.data ?? []);

  const saveMutation = useMutation({
    mutationFn: (slugs: string[]) => adminSaveInventory(userId, slugs),
    onSuccess: (_data, slugs) => {
      queryClient.setQueryData(qk.adminUserInventory(userId), slugs);
      void queryClient.invalidateQueries({ queryKey: qk.inventory(userId) });
      // The target user's public profile (owned library + count) and the players
      // directory (owned count per player) are separate query caches keyed by
      // profile/players, not by inventory. Without these, a 5-minute staleTime
      // (see query-client.ts) means an admin's collection edit doesn't appear on
      // the profile until the cache expires or the tab is hard-reloaded.
      void queryClient.invalidateQueries({ queryKey: qk.profile(userId) });
      void queryClient.invalidateQueries({ queryKey: qk.players() });
      // A removed game stops being new; the toggles re-read what is owned.
      void queryClient.invalidateQueries({ queryKey: qk.adminUserNewSlugs(userId) });
    },
  });

  const error =
    errorMessageOf(inventoryQuery.error, "Failed to load") ??
    errorMessageOf(saveMutation.error, "Save failed") ??
    errorMessageOf(newMutation.error, "Could not update the New marker");

  if (inventoryQuery.isPending || !list.isReady || list.draft === null) {
    return <LoadingState label="Loading inventory…" className="justify-start py-3" />;
  }

  return (
    <div className="space-y-3">
      {error && <ErrorAlert message={error} />}
      <InventoryGrid
        selected={list.draft}
        onToggle={list.toggle}
        games={ownableGames}
        renderTrailing={(game) =>
          saved.has(game.slug) ? (
            <Chip
              pressed={newSet.has(game.slug)}
              tone="sky"
              size="xs"
              shape="pill"
              disabled={newMutation.isPending}
              title={
                newSet.has(game.slug)
                  ? "Marked new — clears the acquisition date"
                  : "Mark as new in the library (dates the copy today)"
              }
              aria-label={`${newSet.has(game.slug) ? "Unmark" : "Mark"} ${game.title} as new`}
              onClick={() => newMutation.mutate({ slug: game.slug, value: !newSet.has(game.slug) })}
            >
              New
            </Chip>
          ) : null
        }
      />
      <CardDeckList selected={list.draft} onToggle={list.toggle} />
      <ExitBoxList selected={list.draft} onToggle={list.toggle} />
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-fg-muted">
          {list.draft.length} of {ownableGames.length + CARD_DECKS.length + EXIT_GAMES.length}{" "}
          selected
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
