import type { OnlineMode } from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ActivityDrawer,
  type AdminUser,
  AnnouncementsCard,
  AvailabilityDrawer,
  coverageRatio,
  GuestPlayersCard,
  InactiveToggleRow,
  PreRegisterCard,
  PurchaseVoteCard,
  ResetLinkModal,
  SkillRatingsCard,
  UserRow,
  UsersTable,
} from "../components/admin";
import { TopNav, TopNavBackButton } from "../components/TopNav";
import {
  Chip,
  ErrorAlert,
  PageHeader,
  PageMain,
  PageShell,
  SegmentedControl,
} from "../components/ui";
import { useAdminUsers } from "../hooks/useAdminUsers.ts";
import { useCurrentUser } from "../hooks/useCurrentUser.ts";
import { adminGenerateResetLink, adminSetOnlineMode } from "../lib/admin";
import { authClient } from "../lib/auth-client";
import { adminFetchAnnouncements } from "../lib/collection.ts";
import { errorMessageOf } from "../lib/error-message";
import { adminFetchLastPlayed } from "../lib/match-history";
import {
  type AggregateAvailabilityMap,
  adminFetchAllAvailability,
  dateKey,
} from "../lib/offline-availability";
import { build42Days, startOfWeekMonday } from "../lib/offline-week";
import { qk } from "../lib/query-keys";
import {
  type Coverage,
  computeCoverage,
  daysAtZeroCoverage,
  isInactiveMember,
  latestMarkedDayByUser,
} from "./admin-coverage";

/** One member's computed table row: the user, their coverage, how many days
 *  they've been sitting at 0% (0 whenever any coverage exists), and whether
 *  that lands them behind the show-inactive expander. */
type MemberRow = { user: AdminUser; coverage: Coverage; zeroDays: number; inactive: boolean };

/** URL-backed tab set (`?tab=…`; Users is the bare default). */
const ADMIN_TABS = ["users", "vote", "pre-register", "skills", "guests"] as const;
type AdminTab = (typeof ADMIN_TABS)[number];

function isAdminTab(v: string | null): v is AdminTab {
  return v !== null && (ADMIN_TABS as readonly string[]).includes(v);
}

/**
 * The admin dashboard, one tab per concern: the users table (plus the
 * ownership-announcements queue — it's per-user work), the purchase vote,
 * the pre-register queue, skill ratings, and guest players. Tabs are
 * URL-backed like the collection page's `?tab=purchases`, and only the
 * active tab's panel mounts, so each tab's queries fire on demand.
 *
 * Coordinates the queries / mutations and threads handlers through to the
 * sub-components in `components/admin/`. The page itself stays a thin shell:
 * everything that does its own work (drawers, panels, table rows) lives in
 * its own file.
 */
export default function AdminPage() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useCurrentUser();
  const currentUserId = currentUser?.id ?? null;

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: AdminTab = isAdminTab(tabParam) ? tabParam : "users";
  function setTab(next: AdminTab) {
    const params = new URLSearchParams(searchParams);
    if (next === "users") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  }

  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [calendarUser, setCalendarUser] = useState<AdminUser | null>(null);
  const [activityUser, setActivityUser] = useState<AdminUser | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  // The show-inactive expander at the foot of the table starts collapsed —
  // its whole point is getting long-gone players out of the way.
  const [showInactive, setShowInactive] = useState(false);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");

  // Shared with RecordMatchModal's participant picker via the qk.adminUsers()
  // cache key; the hook owns the limit + schema-validation contract.
  const usersQuery = useAdminUsers();

  const aggregateQuery = useQuery({
    queryKey: qk.adminAggregateAvailability(),
    queryFn: ({ signal }) => adminFetchAllAvailability(signal),
  });

  // Shared with AnnouncementsCard via the cache key; here it feeds the
  // per-user pending badge in the users table.
  const announcementsQuery = useQuery({
    queryKey: qk.adminAnnouncements(),
    queryFn: ({ signal }) => adminFetchAnnouncements(signal),
  });
  const pendingAnnouncementsByUser = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of announcementsQuery.data?.announcements ?? []) {
      counts.set(a.userId, (counts.get(a.userId) ?? 0) + 1);
    }
    return counts;
  }, [announcementsQuery.data]);

  // Editable window = the 42-day grid the dashboard exposes, minus past days.
  const editableDateKeys = useMemo(() => {
    const today = new Date();
    const todayKey = dateKey(today);
    const weekStart = startOfWeekMonday(today);
    return build42Days(weekStart)
      .map((d) => dateKey(d))
      .filter((key) => key >= todayKey);
  }, []);

  const rawUsers = usersQuery.data ?? [];
  const aggregate: AggregateAvailabilityMap = aggregateQuery.data ?? {};

  // Guest players belong to their own card below — no email, no calendar,
  // no inventory, no online toggle. Internal QA accounts stay hidden
  // everywhere.
  const guests = useMemo(() => rawUsers.filter((u) => u.guest && !u.internal), [rawUsers]);

  // Date of each member's most recent recorded match — one of the two signals
  // (with marked days) behind the inactivity clock in admin-coverage.ts.
  const lastPlayedQuery = useQuery({
    queryKey: qk.adminLastPlayed(),
    queryFn: ({ signal }) => adminFetchLastPlayed(signal),
  });

  // Visible members: hide internal + guest accounts, sort admins first, then
  // by coverage % descending; within the 0% group the freshest lapse sorts
  // first, so the stalest players sink toward the bottom. Members at 0% for
  // INACTIVE_AFTER_DAYS+ hide behind the show-inactive expander at the foot
  // of the table — except admins, and only once last-played has loaded
  // (before that, a player whose only signal is a recorded match would flash
  // behind the expander and back out). Both partitions keep the ONE sorted
  // order, so expanding simply continues the list (stalest last).
  const { allMembers, activeRows, inactiveRows } = useMemo(() => {
    const visible = rawUsers.filter((u) => !u.internal && !u.guest);
    const latestMarked = latestMarkedDayByUser(aggregate);
    const lastPlayed = lastPlayedQuery.data;
    const todayKey = dateKey(new Date());
    const rows: MemberRow[] = visible.map((user) => {
      const coverage = computeCoverage(aggregate, user.id, editableDateKeys);
      const zeroDays = daysAtZeroCoverage({
        coverage,
        latestMarkedDay: latestMarked.get(user.id),
        lastPlayedDay: lastPlayed?.[user.id],
        createdAt: user.createdAt,
        todayKey,
      });
      const inactive = lastPlayed !== undefined && isInactiveMember(user.role, coverage, zeroDays);
      return { user, coverage, zeroDays, inactive };
    });
    rows.sort((a, b) => {
      const aAdmin = a.user.role === "admin" ? 1 : 0;
      const bAdmin = b.user.role === "admin" ? 1 : 0;
      if (aAdmin !== bAdmin) return bAdmin - aAdmin;
      // Sort on the full-precision ratio, the same helper the pie's label
      // rounds — so the column never sorts by one formula and reads by another.
      const aPct = coverageRatio(a.coverage);
      const bPct = coverageRatio(b.coverage);
      if (aPct !== bPct) return bPct - aPct;
      if (a.zeroDays !== b.zeroDays) return a.zeroDays - b.zeroDays;
      return (a.user.name || a.user.email).localeCompare(b.user.name || b.user.email);
    });
    return {
      allMembers: rows.map((r) => r.user),
      activeRows: rows.filter((r) => !r.inactive),
      inactiveRows: rows.filter((r) => r.inactive),
    };
  }, [rawUsers, aggregate, editableDateKeys, lastPlayedQuery.data]);

  const setOnlineModeMutation = useMutation({
    mutationFn: ({ userId, mode }: { userId: string; mode: OnlineMode }) =>
      adminSetOnlineMode(userId, mode),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.adminUsers() });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await authClient.admin.removeUser({ userId });
      if (error) throw new Error(error.message ?? "Failed to delete user");
    },
    onSuccess: (_data, userId) => {
      queryClient.removeQueries({ queryKey: qk.inventory(userId) });
      queryClient.removeQueries({ queryKey: qk.availability(userId) });
      queryClient.removeQueries({ queryKey: qk.adminUserInventory(userId) });
      queryClient.removeQueries({ queryKey: qk.adminUserAvailability(userId) });
      void queryClient.invalidateQueries({ queryKey: qk.adminUsers() });
      setConfirmDeleteUserId(null);
      setConfirmEmail("");
    },
  });

  // One-time password-reset link (no email). On success the modal opens with
  // the URL for the admin to copy; `data` carries the user so the modal can
  // name them.
  const [resetResult, setResetResult] = useState<{
    user: AdminUser;
    url: string;
    expiresInMinutes: number;
  } | null>(null);

  const resetLinkMutation = useMutation({
    mutationFn: async (u: AdminUser) => ({ user: u, ...(await adminGenerateResetLink(u.id)) }),
    onSuccess: (data) => setResetResult(data),
  });

  const errorMessage =
    errorMessageOf(usersQuery.error, "Failed to load users") ??
    errorMessageOf(setOnlineModeMutation.error, "Update failed") ??
    errorMessageOf(deleteMutation.error, "Delete failed") ??
    errorMessageOf(resetLinkMutation.error, "Couldn't generate reset link");

  function toggleDeleteMode() {
    setDeleteMode((m) => !m);
    setConfirmDeleteUserId(null);
    setConfirmEmail("");
    deleteMutation.reset();
  }

  function commitDelete(u: AdminUser) {
    if (confirmEmail.trim().toLowerCase() !== u.email.toLowerCase()) return;
    deleteMutation.mutate(u.id);
  }

  function cancelDelete() {
    setConfirmDeleteUserId(null);
    setConfirmEmail("");
    deleteMutation.reset();
  }

  // One member row for both partitions — archived rows revealed by the
  // expander keep the full management surface (inventory, online mode,
  // delete, reset link) and are the only ones carrying the "Nd at 0%" tag.
  function renderMemberRow({ user: u, coverage, zeroDays, inactive }: MemberRow) {
    return (
      <UserRow
        key={u.id}
        user={u}
        coverage={coverage}
        zeroForDays={inactive ? zeroDays : undefined}
        pendingAnnouncements={pendingAnnouncementsByUser.get(u.id) ?? 0}
        expanded={expandedUserId === u.id}
        onToggleInventory={() => setExpandedUserId((prev) => (prev === u.id ? null : u.id))}
        onSetOnlineMode={(mode) => setOnlineModeMutation.mutate({ userId: u.id, mode })}
        pending={
          setOnlineModeMutation.isPending && setOnlineModeMutation.variables?.userId === u.id
        }
        onOpenCalendar={() => setCalendarUser(u)}
        onOpenActivity={() => setActivityUser(u)}
        deleteMode={deleteMode}
        isSelf={u.id === currentUserId}
        confirmingDelete={confirmDeleteUserId === u.id}
        confirmEmail={confirmEmail}
        onConfirmEmailChange={setConfirmEmail}
        onStartDelete={() => {
          setConfirmDeleteUserId(u.id);
          setConfirmEmail("");
          deleteMutation.reset();
        }}
        onCancelDelete={cancelDelete}
        onCommitDelete={() => commitDelete(u)}
        deleting={deleteMutation.isPending && deleteMutation.variables === u.id}
        onResetPassword={() => resetLinkMutation.mutate(u)}
        resettingPassword={resetLinkMutation.isPending && resetLinkMutation.variables?.id === u.id}
      />
    );
  }

  return (
    <PageShell topNav={<TopNav back={<TopNavBackButton to="/" />} />}>
      <PageMain width="7xl" padding="dense">
        <PageHeader title="Admin" className="mb-4" />
        <SegmentedControl<AdminTab>
          aria-label="Admin sections"
          options={[
            { value: "users", label: "Users" },
            { value: "vote", label: "Purchase vote" },
            { value: "pre-register", label: "Pre-register" },
            { value: "skills", label: "Skill ratings" },
            { value: "guests", label: "Guests" },
          ]}
          value={tab}
          onChange={setTab}
          shape="pill"
          size="sm"
          className="mb-6"
        />

        {tab === "users" && (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              {deleteMode ? (
                <p className="text-sm text-rose-300">
                  <span className="font-semibold">Delete mode is on.</span> Click{" "}
                  <span className="font-semibold">Delete</span> on a row, then type the user's email
                  to confirm. Deletion is permanent and wipes their inventory and availability.
                </p>
              ) : (
                <p className="text-sm text-fg-muted">
                  Set each member's{" "}
                  <span className="font-medium text-fg-secondary">online mode</span> and{" "}
                  <span className="font-medium text-fg-secondary">inventory</span>; click a name for
                  their activity, the pie for their calendar.
                </p>
              )}
              <Chip
                pressed={deleteMode}
                tone="rose"
                variant="outlined"
                size="sm"
                onClick={toggleDeleteMode}
                className="ml-auto shrink-0"
              >
                {deleteMode ? "Exit delete mode" : "Delete mode"}
              </Chip>
            </div>

            <div className="mb-6 empty:hidden">
              <AnnouncementsCard />
            </div>

            {errorMessage && <ErrorAlert message={errorMessage} className="mb-4" />}

            <UsersTable
              loading={usersQuery.isPending}
              empty={activeRows.length + inactiveRows.length === 0}
              deleteMode={deleteMode}
            >
              {activeRows.map(renderMemberRow)}
              {inactiveRows.length > 0 && (
                <InactiveToggleRow
                  count={inactiveRows.length}
                  expanded={showInactive}
                  onToggle={() => setShowInactive((v) => !v)}
                />
              )}
              {showInactive && inactiveRows.map(renderMemberRow)}
            </UsersTable>
          </>
        )}

        {tab === "vote" && <PurchaseVoteCard />}
        {tab === "pre-register" && <PreRegisterCard />}
        {tab === "skills" && <SkillRatingsCard />}
        {tab === "guests" && (
          <GuestPlayersCard
            guests={guests}
            members={allMembers}
            onChanged={() => {
              void queryClient.invalidateQueries({ queryKey: qk.adminUsers() });
              // A merge rewrites match outcomes — refresh everything derived,
              // including every cached profile (stats + match lists live under
              // the ["profile", …] prefix and are otherwise fresh for 5 min,
              // which made a just-merged member's profile look empty).
              void queryClient.invalidateQueries({ queryKey: qk.history() });
              void queryClient.invalidateQueries({ queryKey: qk.players() });
              void queryClient.invalidateQueries({ queryKey: ["profile"] });
            }}
          />
        )}
      </PageMain>

      {activityUser && <ActivityDrawer user={activityUser} onClose={() => setActivityUser(null)} />}
      {calendarUser && (
        <AvailabilityDrawer user={calendarUser} onClose={() => setCalendarUser(null)} />
      )}

      {resetResult && (
        <ResetLinkModal
          user={resetResult.user}
          url={resetResult.url}
          expiresInMinutes={resetResult.expiresInMinutes}
          onClose={() => {
            setResetResult(null);
            resetLinkMutation.reset();
          }}
        />
      )}
    </PageShell>
  );
}
