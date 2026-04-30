import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import Calendar from "../components/offline/Calendar";
import { TopNav, TopNavBackButton } from "../components/TopNav";
import { Button } from "../components/ui/Button";
import { games } from "../games/registry";
import { adminSetOnline } from "../lib/admin";
import { authClient, useSession } from "../lib/auth-client";
import {
  adminFetchInventory,
  adminFetchPendingInventory,
  adminSaveInventory,
  adminSavePendingInventory,
} from "../lib/inventory";
import { adminFetchAvailability } from "../lib/offline-availability";
import { startOfWeekMonday } from "../lib/offline-week";
import { qk } from "../lib/query-keys";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  onlineEnabled?: boolean | null;
  createdAt: string | Date;
};

export default function AdminPage() {
  const queryClient = useQueryClient();
  const { data: sessionData } = useSession();
  const currentUserId = sessionData?.user?.id ?? null;

  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [calendarUser, setCalendarUser] = useState<AdminUser | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");

  const usersQuery = useQuery({
    queryKey: qk.adminUsers(),
    queryFn: async () => {
      const { data, error } = await authClient.admin.listUsers({ query: { limit: 100 } });
      if (error) throw new Error(error.message ?? "Failed to load users");
      return (data?.users ?? []) as unknown as AdminUser[];
    },
  });

  const users = usersQuery.data ?? [];
  const loading = usersQuery.isPending;

  const toggleOnlineMutation = useMutation({
    mutationFn: (user: AdminUser) => adminSetOnline(user.id, !user.onlineEnabled),
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

  const errorMessage = usersQuery.error
    ? usersQuery.error instanceof Error
      ? usersQuery.error.message
      : "Failed to load users"
    : toggleOnlineMutation.error
      ? toggleOnlineMutation.error instanceof Error
        ? toggleOnlineMutation.error.message
        : "Update failed"
      : deleteMutation.error
        ? deleteMutation.error instanceof Error
          ? deleteMutation.error.message
          : "Delete failed"
        : null;

  function toggleDeleteMode() {
    setDeleteMode((m) => !m);
    setConfirmDeleteUserId(null);
    setConfirmEmail("");
    deleteMutation.reset();
  }

  function startDelete(user: AdminUser) {
    setConfirmDeleteUserId(user.id);
    setConfirmEmail("");
    deleteMutation.reset();
  }

  function cancelDelete() {
    setConfirmDeleteUserId(null);
    setConfirmEmail("");
    deleteMutation.reset();
  }

  function commitDelete(user: AdminUser) {
    if (confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) return;
    deleteMutation.mutate(user.id);
  }

  function toggleInventoryPanel(userId: string) {
    setExpandedUserId((prev) => (prev === userId ? null : userId));
  }

  function openCalendar(user: AdminUser) {
    setCalendarUser(user);
  }

  function closeCalendar() {
    setCalendarUser(null);
  }

  useEffect(() => {
    if (!calendarUser) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setCalendarUser(null);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [calendarUser]);

  return (
    <div className="flex min-h-screen flex-col bg-surface-950 bg-grid">
      <TopNav>
        <TopNavBackButton to="/" label="Dashboard" />
      </TopNav>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="mb-8 flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-white">Users</h1>
            {deleteMode ? (
              <p className="mt-1 text-sm text-rose-300">
                <span className="font-semibold">Delete mode is on.</span> Click{" "}
                <span className="font-semibold">Delete</span> on a row, then type the user's email
                to confirm. Deletion is permanent and wipes their inventory and availability.
              </p>
            ) : (
              <p className="mt-1 text-sm text-gray-500">
                Toggle <span className="font-medium text-gray-300">online</span> to grant a user
                access to multiplayer. Use{" "}
                <span className="font-medium text-gray-300">Inventory</span> to set which games each
                user owns. Click <span className="font-medium text-gray-300">Calendar</span> to
                preview a user's offline availability.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={toggleDeleteMode}
            className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition ${
              deleteMode
                ? "border-rose-500/60 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30"
                : "border-rose-500/30 bg-transparent text-rose-300 hover:bg-rose-500/10"
            }`}
          >
            {deleteMode ? "Exit delete mode" : "Delete mode"}
          </button>
        </div>

        <PreRegisterCard />

        {errorMessage && (
          <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {errorMessage}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-white/10 bg-surface-900 px-6 py-10 text-center text-sm text-gray-500">
            Loading…
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-6 py-10 text-center text-sm text-gray-500">
            No users yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10 bg-surface-900">
            <table className="w-full text-sm">
              <thead className="bg-surface-800 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Name</th>
                  <th className="px-5 py-3 text-left font-medium">Email</th>
                  <th className="px-5 py-3 text-left font-medium">Role</th>
                  <th className="px-5 py-3 text-center font-medium">Calendar</th>
                  <th className="px-5 py-3 text-center font-medium">Inventory</th>
                  <th className="px-5 py-3 text-center font-medium">Online</th>
                  {deleteMode && (
                    <th className="w-32 px-5 py-3 pr-6 text-center font-medium text-rose-300">
                      Delete
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map((u) => {
                  const togglingThisUser =
                    toggleOnlineMutation.isPending && toggleOnlineMutation.variables?.id === u.id;
                  const isSelf = u.id === currentUserId;
                  const deletingThisUser =
                    deleteMutation.isPending && deleteMutation.variables === u.id;
                  return (
                    <UserRow
                      key={u.id}
                      user={u}
                      expanded={expandedUserId === u.id}
                      onToggleInventory={() => toggleInventoryPanel(u.id)}
                      onToggleOnline={() => toggleOnlineMutation.mutate(u)}
                      onOpenCalendar={() => openCalendar(u)}
                      pending={togglingThisUser}
                      deleteMode={deleteMode}
                      isSelf={isSelf}
                      onStartDelete={() => startDelete(u)}
                      confirmingDelete={confirmDeleteUserId === u.id}
                      confirmEmail={confirmEmail}
                      onConfirmEmailChange={setConfirmEmail}
                      onCancelDelete={cancelDelete}
                      onCommitDelete={() => commitDelete(u)}
                      deleting={deletingThisUser}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {calendarUser && <AvailabilityDrawer user={calendarUser} onClose={closeCalendar} />}
    </div>
  );
}

type AvailabilityDrawerProps = {
  user: AdminUser;
  onClose: () => void;
};

function AvailabilityDrawer({ user, onClose }: AvailabilityDrawerProps) {
  const today = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => startOfWeekMonday(today), [today]);

  const availabilityQuery = useQuery({
    queryKey: qk.adminUserAvailability(user.id),
    queryFn: ({ signal }) => adminFetchAvailability(user.id, signal),
  });

  const availability = availabilityQuery.data ?? null;
  const isLoading = availabilityQuery.isPending;
  const error = availabilityQuery.error
    ? availabilityQuery.error instanceof Error
      ? availabilityQuery.error.message
      : "Failed to load availability"
    : null;
  const markedCount = availability ? Object.keys(availability).length : 0;

  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-white/10 bg-surface-950 shadow-2xl shadow-black/50 sm:w-[28rem]">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-accent-400">
            Availability
          </p>
          <h2 className="mt-1 truncate text-base font-semibold text-white">
            {user.name || user.email}
          </h2>
          <p className="mt-0.5 truncate text-xs text-gray-500">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md p-1.5 text-gray-400 transition hover:bg-white/5 hover:text-white"
          aria-label="Close"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M4.3 4.3a1 1 0 011.4 0L10 8.59l4.3-4.3a1 1 0 011.4 1.41L11.41 10l4.3 4.3a1 1 0 01-1.41 1.4L10 11.41l-4.3 4.3a1 1 0 01-1.4-1.41L8.59 10 4.3 5.7a1 1 0 010-1.4z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-4 sm:px-5">
        <p className="shrink-0 text-center text-[11px] text-gray-400">
          <span className="text-accent-300">Can</span>
          <span className="mx-1 opacity-50">·</span>
          <span className="text-amber-300">Maybe</span>
          <span className="mx-1 opacity-50">·</span>
          <span className="opacity-60">unmarked</span>
        </p>

        {isLoading || availability === null ? (
          <p className="text-center text-xs text-gray-500">Loading…</p>
        ) : (
          <Calendar
            weekStart={weekStart}
            availability={availability}
            readonlyBefore={today}
            interactive={false}
            compact
          />
        )}

        {error && (
          <p className="shrink-0 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </p>
        )}

        <p className="shrink-0 text-center text-[11px] text-gray-500">
          {isLoading || availability === null
            ? ""
            : markedCount === 0
              ? "No availability set"
              : `${markedCount} ${markedCount === 1 ? "day" : "days"} marked across the next 6 weeks`}
        </p>
      </div>
    </aside>
  );
}

type UserRowProps = {
  user: AdminUser;
  expanded: boolean;
  onToggleInventory: () => void;
  onToggleOnline: () => void;
  onOpenCalendar: () => void;
  pending: boolean;
  deleteMode: boolean;
  isSelf: boolean;
  onStartDelete: () => void;
  confirmingDelete: boolean;
  confirmEmail: string;
  onConfirmEmailChange: (next: string) => void;
  onCancelDelete: () => void;
  onCommitDelete: () => void;
  deleting: boolean;
};

function UserRow({
  user,
  expanded,
  onToggleInventory,
  onToggleOnline,
  onOpenCalendar,
  pending,
  deleteMode,
  isSelf,
  onStartDelete,
  confirmingDelete,
  confirmEmail,
  onConfirmEmailChange,
  onCancelDelete,
  onCommitDelete,
  deleting,
}: UserRowProps) {
  const columnCount = deleteMode ? 7 : 6;
  const confirmReady = confirmEmail.trim().toLowerCase() === user.email.toLowerCase();
  return (
    <>
      <tr className="text-gray-200">
        <td className="px-5 py-3 font-medium">{user.name || "—"}</td>
        <td className="px-5 py-3 text-gray-400">{user.email}</td>
        <td className="px-5 py-3">
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              user.role === "admin"
                ? "bg-accent-500/20 text-accent-300"
                : "bg-white/5 text-gray-400"
            }`}
          >
            {user.role ?? "user"}
          </span>
        </td>
        <td className="px-5 py-3 text-center">
          <button
            type="button"
            onClick={onOpenCalendar}
            className="rounded-md bg-white/5 px-2.5 py-1 text-xs text-gray-300 transition hover:bg-white/10"
          >
            View
          </button>
        </td>
        <td className="px-5 py-3 text-center">
          <button
            type="button"
            onClick={onToggleInventory}
            className={`rounded-md px-2.5 py-1 text-xs transition ${
              expanded
                ? "bg-accent-500/20 text-accent-200"
                : "bg-white/5 text-gray-300 hover:bg-white/10"
            }`}
          >
            {expanded ? "Close" : "Manage"}
          </button>
        </td>
        <td className="px-5 py-3 text-center">
          <button
            type="button"
            onClick={onToggleOnline}
            disabled={pending}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
              user.onlineEnabled ? "bg-accent-500" : "bg-surface-700"
            } ${pending ? "opacity-50" : ""}`}
            aria-pressed={Boolean(user.onlineEnabled)}
            aria-label={`Toggle online for ${user.email}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                user.onlineEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </td>
        {deleteMode && (
          <td className="w-32 px-5 py-3 pr-6 text-center">
            {isSelf ? (
              <span
                className="inline-flex items-center rounded-md border border-white/5 bg-white/5 px-2.5 py-1 text-xs italic text-gray-500"
                title="You cannot delete yourself"
              >
                you
              </span>
            ) : confirmingDelete ? (
              <span className="inline-flex items-center text-xs text-rose-300">Confirm below…</span>
            ) : (
              <button
                type="button"
                onClick={onStartDelete}
                className="rounded-md bg-rose-500/20 px-2.5 py-1 text-xs font-medium text-rose-200 transition hover:bg-rose-500/30"
              >
                Delete
              </button>
            )}
          </td>
        )}
      </tr>
      {expanded && (
        <tr>
          <td colSpan={columnCount} className="bg-surface-950/50 px-4 py-4">
            <InventoryPanel userId={user.id} />
          </td>
        </tr>
      )}
      {confirmingDelete && (
        <tr>
          <td
            colSpan={columnCount}
            className="border-t border-rose-500/30 bg-rose-950/40 px-4 py-4"
          >
            <div className="space-y-3">
              <p className="text-sm text-rose-100">
                Type{" "}
                <span className="rounded bg-rose-500/20 px-1.5 py-0.5 font-mono text-xs text-rose-100">
                  {user.email}
                </span>{" "}
                to confirm permanent deletion.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  // biome-ignore lint/a11y/noAutofocus: focus on the active confirmation input
                  autoFocus
                  value={confirmEmail}
                  onChange={(e) => onConfirmEmailChange(e.target.value)}
                  placeholder={user.email}
                  disabled={deleting}
                  spellCheck={false}
                  autoComplete="off"
                  className="w-full flex-1 rounded-md border border-rose-500/30 bg-surface-950 px-3 py-1.5 text-sm text-white placeholder:text-gray-600 focus:border-rose-400 focus:outline-none disabled:opacity-50"
                />
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={onCancelDelete} disabled={deleting}>
                    Cancel
                  </Button>
                  <button
                    type="button"
                    onClick={onCommitDelete}
                    disabled={!confirmReady || deleting}
                    className="rounded-md bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:bg-rose-500/30 disabled:text-rose-200"
                  >
                    {deleting ? "Deleting…" : "Delete user"}
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function InventoryPanel({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string[] | null>(null);

  const inventoryQuery = useQuery({
    queryKey: qk.adminUserInventory(userId),
    queryFn: ({ signal }) => adminFetchInventory(userId, signal),
  });

  const committed = inventoryQuery.data ?? [];

  // Initialize/reset draft whenever the committed slug list changes.
  useEffect(() => {
    if (inventoryQuery.data) setDraft(inventoryQuery.data);
  }, [inventoryQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (slugs: string[]) => adminSaveInventory(userId, slugs),
    onSuccess: (_data, slugs) => {
      queryClient.setQueryData(qk.adminUserInventory(userId), slugs);
      void queryClient.invalidateQueries({ queryKey: qk.inventory(userId) });
    },
  });

  const error = inventoryQuery.error
    ? inventoryQuery.error instanceof Error
      ? inventoryQuery.error.message
      : "Failed to load"
    : saveMutation.error
      ? saveMutation.error instanceof Error
        ? saveMutation.error.message
        : "Save failed"
      : null;

  if (inventoryQuery.isPending || draft === null) {
    return <p className="text-xs text-gray-500">Loading inventory…</p>;
  }

  function toggle(slug: string) {
    setDraft((prev) =>
      prev === null ? prev : prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  function save() {
    if (draft === null) return;
    saveMutation.mutate(draft);
  }

  const dirty = draft.length !== committed.length || draft.some((s) => !committed.includes(s));

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {games.map((game) => {
          const checked = draft.includes(game.slug);
          return (
            <label
              key={game.slug}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2 transition ${
                checked
                  ? "border-accent-400/50 bg-accent-500/10"
                  : "border-white/10 bg-surface-800/50 hover:border-white/20"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(game.slug)}
                className="sr-only"
              />
              <img
                src={game.thumbnail}
                alt=""
                className="h-10 w-10 shrink-0 rounded object-cover"
              />
              <span className="min-w-0 flex-1 text-xs">
                <span className="block truncate font-semibold text-gray-200">{game.title}</span>
                <span className="block truncate text-[10px] text-gray-500">{game.slug}</span>
              </span>
              {checked && (
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4 shrink-0 text-accent-300"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.41 0l-3.5-3.5a1 1 0 011.41-1.42L8.5 12.08l6.79-6.79a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </label>
          );
        })}
      </div>
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-gray-500">
          {draft.length} of {games.length} selected
        </span>
        <Button
          variant="primary"
          size="sm"
          onClick={save}
          loading={saveMutation.isPending}
          disabled={!dirty}
        >
          Save inventory
        </Button>
      </div>
    </div>
  );
}

function PreRegisterCard() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  const pendingQuery = useQuery({
    queryKey: qk.adminPendingInventory(),
    queryFn: ({ signal }) => adminFetchPendingInventory(signal),
  });

  const committed = pendingQuery.data ?? [];

  useEffect(() => {
    if (pendingQuery.data) setDraft(pendingQuery.data);
  }, [pendingQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (slugs: string[]) => adminSavePendingInventory(slugs),
    onSuccess: (_data, slugs) => {
      queryClient.setQueryData(qk.adminPendingInventory(), slugs);
    },
  });

  const error = pendingQuery.error
    ? pendingQuery.error instanceof Error
      ? pendingQuery.error.message
      : "Failed to load"
    : saveMutation.error
      ? saveMutation.error instanceof Error
        ? saveMutation.error.message
        : "Save failed"
      : null;

  function toggle(slug: string) {
    setDraft((prev) =>
      prev === null ? prev : prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  function save() {
    if (draft === null) return;
    saveMutation.mutate(draft);
  }

  function clearQueue() {
    saveMutation.mutate([]);
    setDraft([]);
  }

  const loading = pendingQuery.isPending;
  const saving = saveMutation.isPending;
  const dirty =
    draft !== null &&
    (draft.length !== committed.length || draft.some((s) => !committed.includes(s)));
  const queued = committed.length;

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-accent-500/20 bg-surface-900">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-accent-400">
            Pre-register
          </p>
          <p className="mt-1 text-sm text-gray-300">
            {loading
              ? "Loading…"
              : queued === 0
                ? "No collection queued — the next signup will start with no games."
                : `${queued} ${queued === 1 ? "game" : "games"} queued — assigned to the next user who registers.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          disabled={loading}
          className={`shrink-0 rounded-md px-2.5 py-1 text-xs transition ${
            expanded
              ? "bg-accent-500/20 text-accent-200"
              : "bg-white/5 text-gray-300 hover:bg-white/10"
          } ${loading ? "opacity-50" : ""}`}
        >
          {expanded ? "Close" : "Manage"}
        </button>
      </div>
      {expanded && !loading && draft !== null && (
        <div className="space-y-3 border-t border-white/5 bg-surface-950/40 px-4 py-4">
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {games.map((game) => {
              const checked = draft.includes(game.slug);
              return (
                <label
                  key={game.slug}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2 transition ${
                    checked
                      ? "border-accent-400/50 bg-accent-500/10"
                      : "border-white/10 bg-surface-800/50 hover:border-white/20"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(game.slug)}
                    className="sr-only"
                  />
                  <img
                    src={game.thumbnail}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded object-cover"
                  />
                  <span className="min-w-0 flex-1 text-xs">
                    <span className="block truncate font-semibold text-gray-200">{game.title}</span>
                    <span className="block truncate text-[10px] text-gray-500">{game.slug}</span>
                  </span>
                  {checked && (
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-4 w-4 shrink-0 text-accent-300"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.41 0l-3.5-3.5a1 1 0 011.41-1.42L8.5 12.08l6.79-6.79a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </label>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-500">
              {draft.length} of {games.length} selected
            </span>
            <div className="flex items-center gap-2">
              {queued > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearQueue}
                  loading={saving}
                  disabled={saving}
                >
                  Clear queue
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={save}
                loading={saving}
                disabled={!dirty || saving}
              >
                Save queue
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
