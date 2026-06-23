import type { ReactNode } from "react";
import { errorMessageOf } from "../../lib/error-message";
import { ErrorAlert } from "./ErrorAlert";
import { LoadingState } from "./LoadingState";

// ── QueryBoundary ──────────────────────────────────────────────────────────
//
// The standardized async boundary for a React Query result. Replaces the
// scattered `isLoading ? <p>Loading…</p> : isError ? … : data ? … : null`
// ladders with one component that renders loading / error / empty / data
// uniformly via the shared `LoadingState`, `ErrorAlert`, and (optionally)
// `EmptyState` primitives.
//
//   <QueryBoundary query={q} empty={<EmptyState … />} isEmpty={(d) => !d.length}>
//     {(data) => <List items={data} />}
//   </QueryBoundary>
//
// Structural `QueryLike` (not React Query's `UseQueryResult`) so it accepts both
// `useQuery` and `useInfiniteQuery` results — anything exposing data/pending/
// error. `isPending` is React Query v5's "no data yet" flag, so a background
// refetch with cached data keeps rendering the data branch (no loading flash).

type QueryLike<T> = {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
};

type QueryBoundaryProps<T> = {
  query: QueryLike<T>;
  children: (data: T) => ReactNode;
  /** Override the default `<LoadingState fill />`. */
  loading?: ReactNode;
  /** Label for the default LoadingState (ignored when `loading` is set). */
  loadingLabel?: string;
  /** Override the default `<ErrorAlert>`. */
  errorFallback?: (error: unknown) => ReactNode;
  /** Rendered instead of `children` when `isEmpty(data)` is true. */
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
};

export function QueryBoundary<T>({
  query,
  children,
  loading,
  loadingLabel,
  errorFallback,
  empty,
  isEmpty,
}: QueryBoundaryProps<T>) {
  // Error only wins when there's no data to show; an error during a refetch of
  // already-loaded data keeps the data branch.
  if (query.isError && query.data === undefined) {
    if (errorFallback) return <>{errorFallback(query.error)}</>;
    const message = errorMessageOf(query.error, "Something went wrong") ?? "Something went wrong";
    return <ErrorAlert message={message} />;
  }

  if (query.isPending || query.data === undefined) {
    return <>{loading ?? <LoadingState fill label={loadingLabel} />}</>;
  }

  if (empty !== undefined && isEmpty?.(query.data)) {
    return <>{empty}</>;
  }

  return <>{children(query.data)}</>;
}
