import type { ActivityEntry } from "@boardgames/core/protocol";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { games } from "../../games/registry";
import { useAdminUsers } from "../../hooks/useAdminUsers";
import { adminFetchActivity } from "../../lib/admin";
import { formatDayKey } from "../../lib/date-format";
import { qk } from "../../lib/query-keys";
import { Button } from "../ui/Button";
import { Drawer } from "../ui/Drawer";
import { EmptyState } from "../ui/EmptyState";
import { LoadingState } from "../ui/LoadingState";
import { QueryBoundary } from "../ui/QueryBoundary";
import type { AdminUser } from "./types";

type Props = {
  user: AdminUser;
  onClose: () => void;
};

/**
 * Right-side drawer with one member's activity trail (logins, visits, RSVPs,
 * game votes, profile views, …), newest first with keyset "Load more" paging.
 * Same shell as `AvailabilityDrawer`: loads its own query keyed by user id,
 * all dialog behavior from the shared `Drawer` primitive.
 */
export function ActivityDrawer({ user, onClose }: Props) {
  const activityQuery = useInfiniteQuery({
    queryKey: qk.adminUserActivity(user.id),
    queryFn: ({ pageParam, signal }) => adminFetchActivity(user.id, pageParam, signal),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });

  // The admin users list is already cached by the page behind this drawer;
  // reusing it resolves target-user ids in meta ("viewed X's profile").
  const usersQuery = useAdminUsers();
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of usersQuery.data ?? []) map.set(u.id, u.name || u.email);
    return map;
  }, [usersQuery.data]);

  const flat = useMemo(
    () => activityQuery.data?.pages.flatMap((p) => p.entries) ?? undefined,
    [activityQuery.data],
  );

  return (
    <Drawer
      onClose={onClose}
      eyebrow="Activity"
      title={user.name || user.email}
      subheader={<p className="mt-0.5 truncate text-xs text-fg-muted">{user.email}</p>}
    >
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
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <ActivityList entries={entries} nameById={nameById} />
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

// ── Rendering ─────────────────────────────────────────────────────────

function ActivityList({
  entries,
  nameById,
}: {
  entries: ActivityEntry[];
  nameById: Map<string, string>;
}) {
  const groups = useMemo(() => groupByLocalDay(entries), [entries]);
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.key}>
          <h3 className="sticky top-0 bg-surface-900/95 py-1 text-2xs font-semibold uppercase tracking-wide text-fg-muted backdrop-blur-sm">
            {group.label}
          </h3>
          <ul className="mt-1 space-y-0.5">
            {group.entries.map((entry) => (
              <li key={entry.id} className="flex items-baseline gap-2.5 rounded-md px-1 py-1">
                <span className="w-10 shrink-0 text-right text-2xs tabular-nums text-fg-muted">
                  {localTime(entry.createdAt)}
                </span>
                <span
                  aria-hidden
                  className={`relative top-[-1px] h-1.5 w-1.5 shrink-0 self-center rounded-full ${dotClass(entry.type)}`}
                />
                <span className="min-w-0 text-xs leading-5 text-fg-secondary">
                  {describeEntry(entry, nameById)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Parse SQLite UTC "YYYY-MM-DD HH:MM:SS" into a local Date. */
function parseUtcStamp(stamp: string): Date | null {
  const d = new Date(stamp.includes(" ") ? `${stamp.replace(" ", "T")}Z` : stamp);
  return Number.isNaN(d.getTime()) ? null : d;
}

function localTime(stamp: string): string {
  const d = parseUtcStamp(stamp);
  if (!d) return "";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

type DayGroup = { key: string; label: string; entries: ActivityEntry[] };

function groupByLocalDay(entries: ActivityEntry[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const entry of entries) {
    const d = parseUtcStamp(entry.createdAt);
    const key = d
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      : "unknown";
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.entries.push(entry);
    } else {
      groups.push({ key, label: d ? formatDayKey(key) : "Unknown date", entries: [entry] });
    }
  }
  return groups;
}

// ── Per-type labels ───────────────────────────────────────────────────
//
// `meta` is an open Record on the wire; every accessor degrades gracefully
// so an unknown or malformed payload still renders a usable line.

const titleBySlug = new Map(games.map((g) => [g.slug, g.title]));

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function day(meta: Record<string, unknown>): string | undefined {
  const date = str(meta.date);
  return date ? formatDayKey(date) : undefined;
}

function gameTitle(slug: string | undefined): string | undefined {
  return slug ? (titleBySlug.get(slug) ?? slug) : undefined;
}

function describeEntry(entry: ActivityEntry, nameById: Map<string, string>): string {
  const { type, meta } = entry;
  const target = str(meta.targetUserId);
  const targetName = target ? (nameById.get(target) ?? "another member") : undefined;
  const forDay = day(meta);

  switch (type) {
    case "login":
      return "Signed in";
    case "visit":
      return "Visited the site";
    case "rsvp": {
      const status = str(meta.status) === "no" ? "no" : "yes";
      const auto = meta.auto === true ? " (auto)" : "";
      return `RSVP'd ${status}${forDay ? ` for ${forDay}` : ""}${auto}`;
    }
    case "rsvp-cleared":
      return `Cleared their RSVP${forDay ? ` for ${forDay}` : ""}`;
    case "rsvp-kick":
      return `Removed ${targetName ?? "an attendee"} from ${forDay ?? "a night"}`;
    case "game-vote": {
      const title = gameTitle(str(meta.slug)) ?? "a game";
      const reaction = str(meta.reaction) ?? "hype";
      const verb = meta.on === false ? "Removed their" : "Voted";
      return `${verb} ${reaction} ${meta.on === false ? "vote " : ""}for ${title}${forDay ? ` on ${forDay}` : ""}`;
    }
    case "availability": {
      const can = num(meta.can) ?? 0;
      const maybe = num(meta.maybe) ?? 0;
      return `Updated availability (${can} can, ${maybe} maybe)`;
    }
    case "profile-view":
      return `Viewed ${targetName ?? "a member"}'s profile`;
    case "profile-update":
      return "Updated their profile";
    case "avatar-save":
      return targetName ? `Updated ${targetName}'s avatar` : "Updated their avatar";
    case "calendar-feed-subscribe":
      return "Connected the calendar feed";
    case "calendar-feed-unsubscribe":
      return "Disconnected the calendar feed";
    case "picks-locked":
      return meta.on === false
        ? `Reopened game picks${forDay ? ` for ${forDay}` : ""}`
        : `Locked game picks${forDay ? ` for ${forDay}` : ""}`;
    case "night-locked": {
      const host = str(meta.hostName);
      return `Locked game night${forDay ? ` ${forDay}` : ""}${host ? ` (host: ${host})` : ""}`;
    }
    case "night-unlocked":
      return `Unlocked game night${forDay ? ` ${forDay}` : ""}`;
    case "match-recorded": {
      const title = str(meta.gameTitle) ?? "a match";
      return `Recorded ${title}${forDay ? ` for ${forDay}` : ""}`;
    }
    case "match-deleted": {
      const id = num(meta.matchId);
      return `Deleted a match${id !== undefined ? ` (#${id})` : ""}`;
    }
    default:
      // Unknown/future event kinds still render a readable line.
      return type.replace(/-/g, " ");
  }
}

function dotClass(type: string): string {
  switch (type) {
    case "login":
    case "visit":
      return "bg-sky-400/70";
    case "rsvp":
    case "rsvp-cleared":
    case "rsvp-kick":
      return "bg-emerald-400/70";
    case "game-vote":
      return "bg-amber-400/70";
    case "availability":
      return "bg-accent-400/70";
    case "profile-view":
    case "profile-update":
    case "avatar-save":
      return "bg-fuchsia-400/70";
    case "night-locked":
    case "night-unlocked":
    case "picks-locked":
      return "bg-rose-400/70";
    case "match-recorded":
    case "match-deleted":
      return "bg-teal-400/70";
    default:
      return "bg-white/40";
  }
}
