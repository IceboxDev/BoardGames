import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { games } from "../../../games/registry";
import { useAdminUsers } from "../../../hooks/useAdminUsers";
import { adminFetchActivity, adminMarkActivitySeen } from "../../../lib/admin";
import { qk } from "../../../lib/query-keys";
import { Button } from "../../ui/Button";
import { Drawer } from "../../ui/Drawer";
import { EmptyState } from "../../ui/EmptyState";
import { LoadingState } from "../../ui/LoadingState";
import { QueryBoundary } from "../../ui/QueryBoundary";
import type { AdminUser } from "../types";
import { ActivityTrail } from "./ActivityTrail";
import { DevicesSection } from "./DevicesSection";
import type { DescribeContext } from "./describe-context";
import { buildTrail } from "./trail";

type Props = {
  user: AdminUser;
  onClose: () => void;
};

const titleBySlug = new Map(games.map((g) => [g.slug, g.title]));

/**
 * Right-side drawer with one member's activity trail (sign-ins, pages opened,
 * RSVPs, votes, greetings, training, …), newest first with keyset "Load more"
 * paging. Same shell as `AvailabilityDrawer`: loads its own query keyed by
 * user id, all dialog behavior from the shared `Drawer` primitive.
 *
 * Rows become lines in `trail.ts` (folding one action's several rows into one
 * line) with words from `event-labels.ts` / `page-labels.ts`.
 */
export function ActivityDrawer({ user, onClose }: Props) {
  const activityQuery = useInfiniteQuery({
    queryKey: qk.adminUserActivity(user.id),
    queryFn: ({ pageParam, signal }) => adminFetchActivity(user.id, pageParam, signal),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });

  // The admin users list is already cached by the page behind this drawer;
  // reusing it resolves user ids in meta to names ("Viewed Melanie's profile").
  const usersQuery = useAdminUsers();
  const ctx = useMemo((): DescribeContext => {
    const nameById = new Map<string, string>();
    for (const u of usersQuery.data ?? []) nameById.set(u.id, u.name || u.email);
    return {
      subjectId: user.id,
      nameOf: (id) => (id ? nameById.get(id) : undefined),
      gameTitle: (slug) => (slug ? titleBySlug.get(slug) : undefined),
    };
  }, [usersQuery.data, user.id]);

  const flat = useMemo(
    () => activityQuery.data?.pages.flatMap((p) => p.entries) ?? undefined,
    [activityQuery.data],
  );

  // Reading the trail is what "seen" means: once the first page is on screen,
  // move this admin's marker to the newest id shown and drop the users-table
  // bubble. Guarded by the last id reported, so a refetch of the same page
  // doesn't post again — but a newer entry arriving on refetch does.
  const queryClient = useQueryClient();
  const { mutate: reportSeen } = useMutation({
    mutationFn: ({ lastSeenId }: { lastSeenId: number }) =>
      adminMarkActivitySeen(user.id, lastSeenId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.adminUnseenActivity() });
    },
  });
  const reportedRef = useRef(0);
  // The highest id on screen, not the first row's: the trail sorts by event
  // time, and the unseen marker counts by id (insertion order).
  const newestId = useMemo(
    () => (flat && flat.length > 0 ? Math.max(...flat.map((e) => e.id)) : undefined),
    [flat],
  );
  useEffect(() => {
    if (newestId === undefined || newestId <= reportedRef.current) return;
    reportedRef.current = newestId;
    reportSeen({ lastSeenId: newestId });
  }, [newestId, reportSeen]);

  return (
    <Drawer
      onClose={onClose}
      eyebrow="Activity"
      title={user.name || user.email}
      subheader={<p className="mt-0.5 truncate text-xs text-fg-muted">{user.email}</p>}
    >
      <DevicesSection userId={user.id} />
      <QueryBoundary
        query={{ ...activityQuery, data: flat }}
        loading={<LoadingState />}
        errorLabel="Failed to load activity"
        empty={
          <EmptyState
            title="No activity yet"
            description="Nothing has been logged for this member."
          />
        }
        isEmpty={(entries) => entries.length === 0}
      >
        {(entries) => (
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pr-1">
            <ActivityTrail lines={buildTrail(entries, ctx)} />
            {activityQuery.hasNextPage && (
              <div className="flex justify-center py-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => activityQuery.fetchNextPage()}
                  loading={activityQuery.isFetchingNextPage}
                >
                  Load more
                </Button>
              </div>
            )}
          </div>
        )}
      </QueryBoundary>
    </Drawer>
  );
}
