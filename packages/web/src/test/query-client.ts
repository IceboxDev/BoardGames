import { QueryClient } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";

/**
 * The one way a test makes a React Query client: no retries (a failed fetch
 * fails now, not after 1 + 2 + 4 s of backoff) and no garbage-collection
 * timers left running after the test. Pass `staleTime: Infinity` for a cache
 * that must never refetch what a test seeded.
 */
export function testQueryClient(options: { staleTime?: number } = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY, ...options },
      mutations: { retry: false },
    },
  });
}

/**
 * Resolves once nothing is fetching or mutating — the signal to wait for
 * before asserting that something did NOT happen (docs/testing.md), instead
 * of sleeping and hoping the queries were done.
 */
export async function querySettled(qc: QueryClient): Promise<void> {
  await waitFor(() => {
    if (qc.isFetching() + qc.isMutating() > 0) throw new Error("queries still in flight");
  });
}
