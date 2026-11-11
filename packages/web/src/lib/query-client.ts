import { QueryCache, QueryClient } from "@tanstack/react-query";
import { isHibernatedError } from "./site.ts";

/** A request turned away because the site went to sleep: re-check the site
 *  status so the goodbye screen takes over (useSiteStatus). Skipped once the
 *  cached status already says so, so a page full of failing queries asks once. */
function onQueryError(err: unknown) {
  if (!isHibernatedError(err)) return;
  const known = queryClient
    .getQueriesData<{ hibernated?: boolean }>({ queryKey: ["site", "status"] })
    .some(([, data]) => data?.hibernated);
  if (!known) void queryClient.invalidateQueries({ queryKey: ["site", "status"] });
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onQueryError }),
  defaultOptions: {
    queries: {
      // Most data here (availability, locks, inventory, BGG metadata) changes
      // slowly. Five-minute staleness avoids the refetch storm that fired on
      // every focus/route change. Per-query overrides at the call site can
      // opt back into a shorter window when it matters.
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});
