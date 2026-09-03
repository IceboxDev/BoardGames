import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

// Bump when the cache shape changes in a way that makes old cached data
// incompatible with the new code (e.g. after changing a query's response
// type). The persister discards any snapshot that doesn't match.
// v2: AvailableGames gained `topSlugs` and `attendees` fields — old cached
//     payloads would render with empty Attendees and a hidden tab.
// v3: the greeting queue moved to /api/greetings with a widened union —
//     stale ["skills","greeting"] snapshots are dead weight.
// v4: admin purchase-vote tally rows gained a required `voterIds` — a
//     rehydrated pre-v4 poll (validated only at fetch time) crashed the
//     admin vote tab on `voterIds.length`.
const BUSTER = "v4";

export const queryPersister =
  typeof window === "undefined"
    ? null
    : createSyncStoragePersister({
        storage: window.localStorage,
        key: "boardgames-rq-cache",
      });

export const queryPersistBuster = BUSTER;
