import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { AddCustomItemModal } from "../components/collection/AddCustomItemModal.tsx";
import { AnnounceModal } from "../components/collection/AnnounceModal.tsx";
import {
  applyViewState,
  CollectionFilters,
  type CollectionViewState,
  DEFAULT_VIEW_STATE,
} from "../components/collection/CollectionFilters.tsx";
import { CollectionTable } from "../components/collection/CollectionTable.tsx";
import { collectionToCsv, downloadCsv } from "../components/collection/collection-csv.ts";
import { buildCollectionRows } from "../components/collection/collection-rows.ts";
import { PendingAnnouncements } from "../components/collection/PendingAnnouncements.tsx";
import { VocabManagerModal } from "../components/collection/VocabManagerModal.tsx";
import { GalleryIcon } from "../components/icons";
import { PurchasesTab } from "../components/purchases/PurchasesTab.tsx";
import { TopNav, TopNavBackButton } from "../components/TopNav";
import { Button } from "../components/ui/Button.tsx";
import { EmptyState } from "../components/ui/EmptyState.tsx";
import { LoadingState } from "../components/ui/LoadingState.tsx";
import { PageHeader } from "../components/ui/PageHeader.tsx";
import { PageMain, PageShell } from "../components/ui/PageShell.tsx";
import { QueryBoundary } from "../components/ui/QueryBoundary.tsx";
import { SegmentedControl } from "../components/ui/SegmentedControl.tsx";
import { Select } from "../components/ui/Select.tsx";
import { Stack } from "../components/ui/Stack.tsx";
import { ApiError } from "../lib/api-fetch.ts";
import { fetchCollection, upsertCollectionItem } from "../lib/collection.ts";
import { fetchProfile } from "../lib/profile.ts";
import { qk } from "../lib/query-keys.ts";

// "Games owned" profile sub-page: the Games Manager. A functionality-first
// table over the raw stored inventory (catalog games, EXIT boxes, card decks,
// custom items) with per-copy metadata, storage-box grouping, per-user
// vocabularies, played-through records, announcements, and CSV export.
// Any member can view any collection; the owner and admins can edit.
//
// A second tab — Purchases — sits on the same page (deep link
// `?tab=purchases`): the read-only crowdfunding/preorder pipeline. It owns
// its own query and boundary, so neither tab blocks on the other's fetch.

type PageTab = "collection" | "purchases";

export default function GamesManagerPage() {
  const { userId } = useParams<{ userId: string }>();
  const queryClient = useQueryClient();
  const [viewState, setViewState] = useState<CollectionViewState>(DEFAULT_VIEW_STATE);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [assignContainerKey, setAssignContainerKey] = useState("");
  const [modal, setModal] = useState<"announce" | "vocab" | "custom-box" | null>(null);

  // Tab state lives in the URL; the default tab keeps a clean one.
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: PageTab = searchParams.get("tab") === "purchases" ? "purchases" : "collection";
  function setTab(next: PageTab) {
    const params = new URLSearchParams(searchParams);
    if (next === "purchases") params.set("tab", "purchases");
    else params.delete("tab");
    setSearchParams(params, { replace: true });
  }

  const profileQuery = useQuery({
    queryKey: qk.profile(userId),
    queryFn: ({ signal }) => fetchProfile(userId as string, signal),
    enabled: !!userId,
  });
  const collectionQuery = useQuery({
    queryKey: qk.collection(userId as string),
    queryFn: ({ signal }) => fetchCollection(userId as string, signal),
    enabled: !!userId,
  });

  // "Same box": pack every selected game into the chosen game's physical
  // packaging (the container may be among the selection — it skips itself).
  const assignMutation = useMutation({
    mutationFn: async ({ keys, containerKey }: { keys: string[]; containerKey: string }) => {
      const data = collectionQuery.data;
      for (const key of keys) {
        if (key === containerKey) continue;
        const row = data?.items.find((i) => i.id === key && i.slug === null);
        await upsertCollectionItem(
          userId as string,
          row ? { itemId: row.id, containerKey } : { slug: key, containerKey },
        );
      }
    },
    onSuccess: () => {
      setSelection(new Set());
      void queryClient.invalidateQueries({ queryKey: qk.collection(userId as string) });
    },
  });

  const topNav = <TopNav back={<TopNavBackButton to={`/u/${userId}`} />}></TopNav>;
  const firstName = profileQuery.data?.user.name.split(" ")[0] ?? "This player";
  const tabBar = (
    <SegmentedControl<PageTab>
      aria-label="Collection sections"
      options={[
        { value: "collection", label: "Collection" },
        { value: "purchases", label: "Purchases" },
      ]}
      value={tab}
      onChange={setTab}
      size="sm"
      shape="pill"
      // Stack's column stretches children; without this the pill track spans
      // the page with the two tabs huddled at its left end.
      className="self-start"
    />
  );

  if (tab === "purchases") {
    return (
      <PageShell topNav={topNav}>
        <PurchasesTab userId={userId as string} firstName={firstName} tabBar={tabBar} />
      </PageShell>
    );
  }

  return (
    <PageShell topNav={topNav}>
      <QueryBoundary
        query={collectionQuery}
        loading={
          <PageMain width="7xl" padding="spacious" fillHeight>
            <LoadingState fillHeight label="Loading collection…" />
          </PageMain>
        }
        errorFallback={(error) => {
          const notFound = error instanceof ApiError && error.status === 404;
          return (
            <PageMain width="7xl" padding="spacious">
              <EmptyState
                tone="rose"
                title={notFound ? "Player not found" : "Couldn't load the collection"}
                description={
                  notFound
                    ? "This player doesn't exist or has been removed."
                    : "Something went wrong fetching the collection. Try again."
                }
                action={
                  <Button variant="secondary" onClick={() => collectionQuery.refetch()}>
                    Retry
                  </Button>
                }
              />
            </PageMain>
          );
        }}
      >
        {(collection) => renderBody(collection)}
      </QueryBoundary>
    </PageShell>
  );

  // Plain render helper (NOT a component — a nested component definition would
  // get a fresh identity every render and remount its whole subtree).
  function renderBody(collection: NonNullable<typeof collectionQuery.data>) {
    const rows = buildCollectionRows(collection);
    const playedThroughCount = rows.filter((r) => r.playedThrough).length;
    const filtered = applyViewState(rows, viewState);
    const editable = collection.editable;
    const ownedCount = rows.length - playedThroughCount;
    const packedCount = rows.filter((r) => r.item?.containerKey != null).length;
    // Any owned, un-destroyed, un-packed game can host others in its box.
    const containerOptions = rows.filter((r) => !r.playedThrough && r.item?.containerKey == null);

    return (
      <PageMain width="7xl" padding="spacious">
        <Stack gap="lg">
          <PageHeader
            size="lg"
            eyebrow="Collection"
            title={editable ? "Games manager" : `${firstName}'s collection`}
            subtitle={`${ownedCount} owned${
              playedThroughCount > 0 ? ` · ${playedThroughCount} played through` : ""
            }${packedCount > 0 ? ` · ${packedCount} packed in shared boxes` : ""}`}
            actions={
              editable ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setModal("custom-box")}>
                    Add unlisted box
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setModal("vocab")}>
                    Sleeves & statuses
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      downloadCsv(`collection-${userId}.csv`, collectionToCsv(rows, collection))
                    }
                  >
                    Export CSV
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => setModal("announce")}>
                    Announce new ownership
                  </Button>
                </div>
              ) : undefined
            }
          />

          {tabBar}

          {editable && (
            <PendingAnnouncements
              userId={userId as string}
              announcements={collection.announcements}
            />
          )}

          {rows.length === 0 ? (
            <EmptyState
              icon={<GalleryIcon className="h-4 w-4" />}
              title="No games in this collection"
              description={
                editable
                  ? "Announce your first acquisition — an admin will confirm it."
                  : `${firstName} doesn't own any games yet.`
              }
              action={
                editable ? (
                  <Button variant="primary" size="sm" onClick={() => setModal("announce")}>
                    Announce new ownership
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <CollectionFilters
                collection={collection}
                state={viewState}
                onChange={setViewState}
                playedThroughCount={playedThroughCount}
              />

              {editable && selection.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent-400/30 bg-accent-500/[0.06] px-3 py-2">
                  <span className="text-xs text-fg-secondary">
                    {selection.size} selected — pack them into one game's box:
                  </span>
                  <Select
                    aria-label="Pack selected games into a game's box"
                    size="sm"
                    block={false}
                    value={assignContainerKey}
                    onChange={(e) => setAssignContainerKey(e.target.value)}
                  >
                    <option value="">Whose box…</option>
                    {containerOptions.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.title}
                      </option>
                    ))}
                  </Select>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!assignContainerKey}
                    loading={assignMutation.isPending}
                    onClick={() =>
                      assignMutation.mutate({
                        keys: [...selection],
                        containerKey: assignContainerKey,
                      })
                    }
                  >
                    Pack together
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelection(new Set())}>
                    Clear
                  </Button>
                </div>
              )}

              <CollectionTable
                userId={userId as string}
                rows={filtered}
                allRows={rows}
                collection={collection}
                editable={editable}
                groupByContainer={viewState.view === "by-box"}
                selection={selection}
                onToggleSelect={(key) =>
                  setSelection((prev) => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  })
                }
              />
            </>
          )}
        </Stack>

        {modal === "announce" && (
          <AnnounceModal
            userId={userId as string}
            collection={collection}
            onClose={() => setModal(null)}
          />
        )}
        {modal === "custom-box" && (
          <AddCustomItemModal userId={userId as string} onClose={() => setModal(null)} />
        )}
        {modal === "vocab" && (
          <VocabManagerModal
            userId={userId as string}
            collection={collection}
            onClose={() => setModal(null)}
          />
        )}
      </PageMain>
    );
  }
}
