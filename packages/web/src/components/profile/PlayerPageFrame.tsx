import type { ReactNode } from "react";
import { ApiError } from "../../lib/api-fetch.ts";
import { TopNav, TopNavBackButton } from "../TopNav";
import { Button } from "../ui/Button.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { LoadingState } from "../ui/LoadingState.tsx";
import { PageMain, type PageMainWidth, PageShell } from "../ui/PageShell.tsx";
import { QueryBoundary } from "../ui/QueryBoundary.tsx";

// ── PlayerPageFrame / PlayerQueryBoundary ────────────────────────────────
//
// The one shell for every player-scoped page (/u/:userId/*): top nav with a
// Back button, and the page's primary query rendered through ONE async
// contract — full-area loading, a rose "not found / couldn't load" state with
// Retry, then the data. Six pages used to each carry a 35-line copy of this,
// down to the same "This player doesn't exist or has been removed." string.
//
//   <PlayerPageFrame query={q} back={`/u/${userId}`} loadingLabel="Loading profile…"
//                    errorTitle="Couldn't load this profile"
//                    errorDescription="Something went wrong fetching the profile. Try again.">
//     {(profile) => <PageMain …>…</PageMain>}
//   </PlayerPageFrame>
//
// `children` render the DATA branch and own their `<PageMain>` — width and
// padding are the page's decision — while the frame owns the two other
// branches at the same `width`, so loading, error and content never jump.
//
// `PlayerQueryBoundary` is the boundary alone, for a second query rendered
// INSIDE an already-framed page (the collection page's Purchases tab).

type QueryLike<T> = {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
};

/** A caller-specific error reading; return null to fall through to the defaults. */
export type ResolveError = (error: unknown) => { title: string; description: string } | null;

const NOT_FOUND = {
  title: "Player not found",
  description: "This player doesn't exist or has been removed.",
};

function isPlayerNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

type BoundaryProps<T> = {
  query: QueryLike<T>;
  /** `PageMain` width for the loading and error branches. */
  width?: PageMainWidth;
  loadingLabel: string;
  /** Rendered above the spinner (a tab bar that must stay usable while loading). */
  loadingExtra?: ReactNode;
  /** Headline for a failure that is not a 404. */
  errorTitle: string;
  errorDescription: string;
  /** First say on an error; `null` defers to the 404 / generic defaults. */
  resolveError?: ResolveError;
  children: (data: T) => ReactNode;
};

export function PlayerQueryBoundary<T>({
  query,
  width = "6xl",
  loadingLabel,
  loadingExtra,
  errorTitle,
  errorDescription,
  resolveError,
  children,
}: BoundaryProps<T>) {
  return (
    <QueryBoundary
      query={query}
      loading={
        <PageMain width={width} padding="spacious" fillHeight>
          {loadingExtra}
          <LoadingState fillHeight label={loadingLabel} />
        </PageMain>
      }
      errorFallback={(error) => {
        const copy =
          resolveError?.(error) ??
          (isPlayerNotFound(error)
            ? NOT_FOUND
            : { title: errorTitle, description: errorDescription });
        return (
          <PageMain width={width} padding="spacious">
            <EmptyState
              tone="rose"
              title={copy.title}
              description={copy.description}
              action={
                <Button variant="secondary" onClick={() => query.refetch()}>
                  Retry
                </Button>
              }
            />
          </PageMain>
        );
      }}
    >
      {children}
    </QueryBoundary>
  );
}

type FrameProps<T> = BoundaryProps<T> & {
  /** Where the top-nav Back button goes. */
  back: string;
  /** Extra top-nav actions rendered after the Back button. */
  navActions?: ReactNode;
};

export function PlayerPageFrame<T>({ back, navActions, ...boundary }: FrameProps<T>) {
  return (
    <PageShell topNav={<TopNav back={<TopNavBackButton to={back} />}>{navActions}</TopNav>}>
      <PlayerQueryBoundary {...boundary} />
    </PageShell>
  );
}
