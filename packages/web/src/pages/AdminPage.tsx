import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Calendar from "../components/offline/Calendar";
import { Button } from "../components/ui/Button";
import { games } from "../games/registry";
import { apiUrl } from "../lib/api-base";
import { authClient } from "../lib/auth-client";
import { adminFetchInventory, adminSaveInventory } from "../lib/inventory";
import { type AvailabilityMap, adminFetchAvailability } from "../lib/offline-availability";
import { startOfWeekMonday } from "../lib/offline-week";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  onlineEnabled?: boolean | null;
  createdAt: string | Date;
};

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [calendarUser, setCalendarUser] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await authClient.admin.listUsers({
      query: { limit: 100 },
    });
    if (err) {
      setError(err.message ?? "Failed to load users");
    } else if (data) {
      setUsers(data.users as unknown as AdminUser[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleOnline(user: AdminUser) {
    setPendingId(user.id);
    try {
      const res = await fetch(apiUrl(`/api/admin/users/${user.id}/online`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ onlineEnabled: !user.onlineEnabled }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, onlineEnabled: !user.onlineEnabled } : u)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setPendingId(null);
    }
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
      <header className="flex items-center justify-between border-b border-white/5 px-6 py-4">
        <Link
          to="/"
          className="text-sm font-semibold tracking-tight text-gray-200 hover:text-white"
        >
          ← Board Game Lab
        </Link>
        <span className="text-xs uppercase tracking-wider text-accent-400">Admin</span>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-white">Users</h1>
          <p className="mt-1 text-sm text-gray-500">
            Toggle <span className="font-medium text-gray-300">online</span> to grant a user access
            to multiplayer. Use <span className="font-medium text-gray-300">Inventory</span> to set
            which games each user owns. Click{" "}
            <span className="font-medium text-gray-300">Calendar</span> to preview a user's offline
            availability.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
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
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                  <th className="px-4 py-3 text-right font-medium">Calendar</th>
                  <th className="px-4 py-3 text-right font-medium">Inventory</th>
                  <th className="px-4 py-3 text-right font-medium">Online</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    expanded={expandedUserId === u.id}
                    onToggleInventory={() => toggleInventoryPanel(u.id)}
                    onToggleOnline={() => toggleOnline(u)}
                    onOpenCalendar={() => openCalendar(u)}
                    pending={pendingId === u.id}
                  />
                ))}
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
  const [availability, setAvailability] = useState<AvailabilityMap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAvailability(null);
    setError(null);
    adminFetchAvailability(user.id)
      .then((map) => {
        if (!cancelled) setAvailability(map);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load availability");
        setAvailability({});
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

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

        {availability === null ? (
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
          {availability === null
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
};

function UserRow({
  user,
  expanded,
  onToggleInventory,
  onToggleOnline,
  onOpenCalendar,
  pending,
}: UserRowProps) {
  return (
    <>
      <tr className="text-gray-200">
        <td className="px-4 py-3 font-medium">{user.name || "—"}</td>
        <td className="px-4 py-3 text-gray-400">{user.email}</td>
        <td className="px-4 py-3">
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
        <td className="px-4 py-3 text-right">
          <button
            type="button"
            onClick={onOpenCalendar}
            className="rounded-md bg-white/5 px-2.5 py-1 text-xs text-gray-300 transition hover:bg-white/10"
          >
            View
          </button>
        </td>
        <td className="px-4 py-3 text-right">
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
        <td className="px-4 py-3 text-right">
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
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-surface-950/50 px-4 py-4">
            <InventoryPanel userId={user.id} />
          </td>
        </tr>
      )}
    </>
  );
}

function InventoryPanel({ userId }: { userId: string }) {
  const [draft, setDraft] = useState<string[]>([]);
  const [committed, setCommitted] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    adminFetchInventory(userId)
      .then((slugs) => {
        if (cancelled) return;
        setCommitted(slugs);
        setDraft(slugs);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  function toggle(slug: string) {
    setDraft((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await adminSaveInventory(userId, draft);
      setCommitted(draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const dirty = draft.length !== committed.length || draft.some((s) => !committed.includes(s));

  if (loading) {
    return <p className="text-xs text-gray-500">Loading inventory…</p>;
  }

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
        <Button variant="primary" size="sm" onClick={save} loading={saving} disabled={!dirty}>
          Save inventory
        </Button>
      </div>
    </div>
  );
}
