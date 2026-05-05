import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

// Bump when the cache shape changes in a way that makes old cached data
// incompatible with the new code (e.g. after changing a query's response
// type). The persister discards any snapshot that doesn't match.
const BUSTER = "v1";

export const queryPersister =
  typeof window === "undefined"
    ? null
    : createSyncStoragePersister({
        storage: window.localStorage,
        key: "boardgames-rq-cache",
      });

export const queryPersistBuster = BUSTER;
