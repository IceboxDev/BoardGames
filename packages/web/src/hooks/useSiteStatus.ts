import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { qk } from "../lib/query-keys.ts";
import { fetchSiteStatus } from "../lib/site.ts";
import { useCurrentUser } from "./useCurrentUser.ts";

/**
 * Whether the site is hibernating, and what this viewer may still do. Never
 * persisted to disk (App.tsx excludes the "site" key), checked again when the
 * window regains focus and every five minutes, and invalidated by any request
 * the server turns away as HIBERNATED (lib/query-client.ts) — so an open tab
 * flips to the goodbye screen on its next request.
 *
 * It does not wait for the session: the request carries the cookie, so the
 * server answers for whoever is signed in. The key still follows the user, so
 * signing in or out asks again, and the previous answer stays on screen
 * meanwhile instead of a loading flash.
 */
export function useSiteStatus() {
  const { user } = useCurrentUser();
  return useQuery({
    queryKey: qk.siteStatus(user?.id),
    queryFn: ({ signal }) => fetchSiteStatus(signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}
