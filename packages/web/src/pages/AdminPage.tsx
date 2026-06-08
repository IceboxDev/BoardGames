import type { OnlineMode } from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  type AdminUser,
  AvailabilityDrawer,
  GuestPlayersCard,
  PreRegisterCard,
  UserRow,
  UsersTable,
} from "../components/admin";
import { TopNav, TopNavBackButton } from "../components/TopNav";
import { Chip, ErrorAlert, PageMain, PageShell } from "../components/ui";
import { useAdminUsers } from "../hooks/useAdminUsers.ts";
import { useCurrentUser } from "../hooks/useCurrentUser.ts";
import { adminSetOnlineMode } from "../lib/admin";
import { authClient } from "../lib/auth-client";
import { errorMessageOf } from "../lib/error-message";
import {
  type AggregateAvailabilityMap,
  adminFetchAllAvailability,
  dateKey,
} from "../lib/offline-availability";
import { build42Days, startOfWeekMonday } from "../lib/offline-week";
import { qk } from "../lib/query-keys";
import { computeCoverage } from "./admin-coverage";

/**
 * The admin dashboard — users table + pre-register queue + guest-players
 * editor + per-user availability drawer.
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

  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [calendarUser, setCalendarUser] = useState<AdminUser | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");

  // Shared with RecordMatchModal's participant picker via the qk.adminUsers()
  // cache key; the hook owns the limit + schema-validation contract.
  const usersQuery = useAdminUsers();

  const aggregateQuery = useQuery({
    queryKey: qk.adminAggregateAvailability(),
    queryFn: ({ signal }) => adminFetchAllAvailability(signal),
  });

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

  // Visible users in the main table: hide internal + guest accounts, sort
  // admins first, then by coverage % descending, then alphabetical on name
  // for a stable tiebreaker.
  const users = useMemo(() => {
    const visible = rawUsers.filter((u) => !u.internal && !u.guest);
    return [...visible].sort((a, b) => {
      const aAdmin = a.role === "admin" ? 1 : 0;
      const bAdmin = b.role === "admin" ? 1 : 0;
      if (aAdmin !== bAdmin) return bAdmin - aAdmin;
      const ca = computeCoverage(aggregate, a.id, editableDateKeys);
      const cb = computeCoverage(aggregate, b.id, editableDateKeys);
      const aPct = ca.total > 0 ? (ca.can + ca.maybe) / ca.total : 0;
      const bPct = cb.total > 0 ? (cb.can + cb.maybe) / cb.total : 0;
      if (aPct !== bPct) return bPct - aPct;
      return (a.name || a.email).localeCompare(b.name || b.email);
    });
  }, [rawUsers, aggregate, editableDateKeys]);

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

  const errorMessage =
    errorMessageOf(usersQuery.error, "Failed to load users") ??
    errorMessageOf(setOnlineModeMutation.error, "Update failed") ??
    errorMessageOf(deleteMutation.error, "Delete failed");

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

  return (
    <PageShell
      topNav={
        <TopNav>
          <TopNavBackButton to="/" label="Dashboard" />
        </TopNav>
      }
    >
      <PageMain width="7xl" padding="none" className="px-6 py-10">
        {/* Header grid: title + delete-mode chip side-by-side, descriptive
            paragraph spans both columns on row 2. */}
        <div className="mb-8 grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-2 sm:gap-x-6">
          <h1 className="text-2xl font-bold tracking-tight text-white">Users</h1>
          <Chip
            pressed={deleteMode}
            tone="rose"
            variant="outlined"
            size="sm"
            onClick={toggleDeleteMode}
            className="justify-self-end"
          >
            {deleteMode ? "Exit delete mode" : "Delete mode"}
          </Chip>
          {deleteMode ? (
            <p className="col-span-2 text-sm text-rose-300">
              <span className="font-semibold">Delete mode is on.</span> Click{" "}
              <span className="font-semibold">Delete</span> on a row, then type the user's email to
              confirm. Deletion is permanent and wipes their inventory and availability.
            </p>
          ) : (
            <p className="col-span-2 text-sm text-fg-muted">
              Set each user's <span className="font-medium text-fg-secondary">online mode</span> —{" "}
              <span className="font-medium text-fg-secondary">Offline</span> for in-person only,{" "}
              <span className="font-medium text-fg-secondary">Online</span> for multiplayer only, or{" "}
              <span className="font-medium text-fg-secondary">Both</span>. Use{" "}
              <span className="font-medium text-fg-secondary">Inventory</span> to set which games
              each user owns. Click <span className="font-medium text-fg-secondary">Calendar</span>{" "}
              to preview a user's offline availability.
            </p>
          )}
        </div>

        <PreRegisterCard />
        <GuestPlayersCard
          guests={guests}
          onChanged={() => queryClient.invalidateQueries({ queryKey: qk.adminUsers() })}
        />

        {errorMessage && <ErrorAlert message={errorMessage} className="mb-4" />}

        <UsersTable
          loading={usersQuery.isPending}
          empty={users.length === 0}
          deleteMode={deleteMode}
        >
          {users.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              coverage={computeCoverage(aggregate, u.id, editableDateKeys)}
              expanded={expandedUserId === u.id}
              onToggleInventory={() => setExpandedUserId((prev) => (prev === u.id ? null : u.id))}
              onSetOnlineMode={(mode) => setOnlineModeMutation.mutate({ userId: u.id, mode })}
              pending={
                setOnlineModeMutation.isPending && setOnlineModeMutation.variables?.userId === u.id
              }
              onOpenCalendar={() => setCalendarUser(u)}
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
            />
          ))}
        </UsersTable>
      </PageMain>

      {calendarUser && (
        <AvailabilityDrawer user={calendarUser} onClose={() => setCalendarUser(null)} />
      )}
    </PageShell>
  );
}
