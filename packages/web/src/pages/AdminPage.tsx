import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../lib/api-base";
import { authClient } from "../lib/auth-client";

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
            to multiplayer.
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
                  <th className="px-4 py-3 text-right font-medium">Online</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map((u) => (
                  <tr key={u.id} className="text-gray-200">
                    <td className="px-4 py-3 font-medium">{u.name || "—"}</td>
                    <td className="px-4 py-3 text-gray-400">{u.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          u.role === "admin"
                            ? "bg-accent-500/20 text-accent-300"
                            : "bg-white/5 text-gray-400"
                        }`}
                      >
                        {u.role ?? "user"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => toggleOnline(u)}
                        disabled={pendingId === u.id}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                          u.onlineEnabled ? "bg-accent-500" : "bg-surface-700"
                        } ${pendingId === u.id ? "opacity-50" : ""}`}
                        aria-pressed={Boolean(u.onlineEnabled)}
                        aria-label={`Toggle online for ${u.email}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                            u.onlineEnabled ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
