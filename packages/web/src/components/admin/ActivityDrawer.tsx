import type { ActivityEntry, AdminDevice } from "@boardgames/core/protocol";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { games } from "../../games/registry";
import { useAdminUsers } from "../../hooks/useAdminUsers";
import { adminFetchActivity, adminFetchDevices } from "../../lib/admin";
import { formatDayKey, formatRelativeTime, parseUtcStamp } from "../../lib/date-format";
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

// ── Devices ───────────────────────────────────────────────────────────
//
// Every distinct setup this member has browsed on — the reproduction recipe
// for their layout issues: screen, DPR, zoom, and the CSS viewport to set the
// dev-tools emulator to. Silently absent until the member's client reports.

function DevicesSection({ userId }: { userId: string }) {
  const devicesQuery = useQuery({
    queryKey: qk.adminUserDevices(userId),
    queryFn: ({ signal }) => adminFetchDevices(userId, signal),
  });
  const devices = devicesQuery.data?.devices ?? [];
  if (devices.length === 0) return null;
  return (
    <section className="shrink-0">
      <h3 className="py-1 text-2xs font-semibold uppercase tracking-wide text-fg-muted">Devices</h3>
      <ul className="space-y-1.5">
        {devices.map((d) => (
          <li key={d.id} className="rounded-lg bg-surface-800/60 px-2.5 py-1.5">
            <DeviceLine device={d} />
          </li>
        ))}
      </ul>
    </section>
  );
}

const DEVICE_GLYPH: Record<AdminDevice["info"]["deviceType"], string> = {
  phone: "📱",
  tablet: "📲",
  desktop: "🖥",
};

function DeviceLine({ device }: { device: AdminDevice }) {
  const { info } = device;
  const ratio = (info.viewportWidth / info.viewportHeight).toFixed(2);
  const label = `${info.deviceType[0]?.toUpperCase()}${info.deviceType.slice(1)}`;
  return (
    <>
      <p className="text-xs text-fg-primary">
        <span aria-hidden className="mr-1">
          {DEVICE_GLYPH[info.deviceType]}
        </span>
        {label} · {info.screenWidth}×{info.screenHeight} @{info.devicePixelRatio}×
        {info.zoomPercent !== undefined && info.zoomPercent !== 100
          ? ` · zoom ~${info.zoomPercent}%`
          : ""}
        {info.pinchScale !== undefined && info.pinchScale !== 1
          ? ` · pinch ${info.pinchScale.toFixed(2)}×`
          : ""}
      </p>
      <p className="text-2xs text-fg-muted">
        viewport {info.viewportWidth}×{info.viewportHeight} ({ratio}:1 {info.orientation})
        {info.browser ? ` · ${info.browser}` : ""}
        {info.os ? ` / ${info.os}` : ""} · seen {device.hits}×, last{" "}
        {formatRelativeTime(device.lastSeen)}
      </p>
    </>
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

// Availability-diff meta: `{ "2026-08-12": "can", … }` maps and date lists,
// rendered as capped day lists so a 40-day first marking stays one line.
const DAY_LIST_CAP = 4;

function dayStatusEntries(v: unknown): [string, string][] | null {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  const entries = Object.entries(v as Record<string, unknown>)
    .filter((e): e is [string, string] => e[1] === "can" || e[1] === "maybe")
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.length > 0 ? entries : null;
}

function dayStatusList(entries: [string, string][]): string {
  const shown = entries.slice(0, DAY_LIST_CAP).map(([d, s]) => `${formatDayKey(d)} (${s})`);
  const more = entries.length - DAY_LIST_CAP;
  return shown.join(", ") + (more > 0 ? ` +${more} more` : "");
}

function dayList(days: string[]): string {
  const shown = days.slice(0, DAY_LIST_CAP).map((d) => formatDayKey(d));
  const more = days.length - DAY_LIST_CAP;
  return shown.join(", ") + (more > 0 ? ` +${more} more` : "");
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
    case "page-view":
      return describePageView(meta);
    case "rsvp": {
      const status = str(meta.status) === "no" ? "no" : "yes";
      const previous = str(meta.previous);
      const auto = meta.auto === true ? " (auto)" : "";
      // `previous` is only logged on an actual status change; without it this
      // was the user's first answer for the night.
      const verb = previous ? `Changed RSVP from ${previous} to ${status}` : `RSVP'd ${status}`;
      return `${verb}${forDay ? ` for ${forDay}` : ""}${auto}`;
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
      // Diff format (current): which days were added / flipped / unmarked.
      const parts: string[] = [];
      const added = dayStatusEntries(meta.added);
      const changed = dayStatusEntries(meta.changed);
      const removed = Array.isArray(meta.removed)
        ? meta.removed.filter((d): d is string => typeof d === "string")
        : [];
      if (added) parts.push(`added ${dayStatusList(added)}`);
      if (changed) parts.push(`changed ${dayStatusList(changed)}`);
      if (removed.length > 0) parts.push(`removed ${dayList(removed)}`);
      if (parts.length > 0) return `Availability: ${parts.join("; ")}`;
      // Legacy entries from before diff logging carried opaque totals.
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
    case "guest-merged": {
      const guestName = str(meta.guestName) ?? "a guest";
      const n = num(meta.matchesUpdated);
      return `Merged guest ${guestName} into ${targetName ?? "an account"}${
        n !== undefined ? ` (${n} match${n === 1 ? "" : "es"})` : ""
      }`;
    }
    default:
      // Unknown/future event kinds still render a readable line.
      return type.replace(/-/g, " ");
  }
}

/** Human line for a `page-view` beacon. Unknown pages degrade to "Viewed <page>". */
function describePageView(meta: Record<string, unknown>): string {
  const page = str(meta.page) ?? "a page";
  const detail = str(meta.detail);
  switch (page) {
    case "home":
      return "Viewed their dashboard";
    case "calendar":
      return "Viewed the calendar";
    case "night":
      return `Opened game night${detail ? ` ${formatDayKey(detail)}` : ""}`;
    case "games":
      return "Browsed the games catalog";
    case "players":
      return "Viewed the players list";
    case "history":
      return "Viewed the match history";
    case "admin":
      return "Viewed the admin dashboard";
    case "play":
      return `Opened ${gameTitle(detail) ?? "a game"}`;
    default:
      return `Viewed ${page}${detail ? ` (${detail})` : ""}`;
  }
}

function dotClass(type: string): string {
  switch (type) {
    case "login":
    case "visit":
    case "page-view":
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
