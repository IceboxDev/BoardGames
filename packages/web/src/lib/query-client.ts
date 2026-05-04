import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
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
