import { useState } from "react";
import { authClient } from "../../lib/auth-client";
import { formatAuthError } from "../../pages/admin-coverage";
import { TrashIcon } from "../icons";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { IconButton } from "../ui/IconButton";
import { synthesizeGuestEmail } from "./guest-email";
import type { AdminUser } from "./types";

type Props = {
  guests: AdminUser[];
  onChanged: () => void;
};

/**
 * Lets the admin create lightweight player stubs (first + last name only) so
 * the match-history picker can credit someone who never signed up. Guests
 * are real Better-Auth users with a synthetic `@guest.local` email and no
 * credential account — they can't sign in, but they do persist alongside
 * regular users so existing match-history endpoints accept their `userId`.
 *
 * `onChanged` is the only side effect this component pushes upward: parent
 * decides how to invalidate caches after add / remove. Keeps the card
 * decoupled from React Query's policy.
 */
export function GuestPlayersCard({ guests, onChanged }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  async function addGuest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const synth = synthesizeGuestEmail(first, last);
    if (!synth) {
      setError("Both first and last name are required");
      return;
    }
    setBusy(true);
    try {
      const { error: apiError } = await authClient.admin.createUser({
        email: synth.email,
        name: synth.name,
      });
      if (apiError) {
        setError(formatAuthError(apiError, "Failed to add guest"));
        return;
      }
      setFirst("");
      setLast("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add guest");
    } finally {
      setBusy(false);
    }
  }

  async function removeGuest(id: string) {
    setError(null);
    setBusy(true);
    try {
      const { error: apiError } = await authClient.admin.removeUser({ userId: id });
      if (apiError) {
        setError(formatAuthError(apiError, "Failed to delete guest"));
        return;
      }
      setPendingDeleteId(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete guest");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-amber-500/20 bg-surface-900">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-amber-400">
            Guest players
          </p>
          <p className="mt-1 text-sm text-gray-300">
            {guests.length === 0
              ? "No guests yet — add stub accounts for people who never signed up."
              : `${guests.length} guest${guests.length === 1 ? "" : "s"} — pickable in match history.`}
          </p>
        </div>
        <Chip
          pressed={expanded}
          tone="amber"
          size="xs"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0"
        >
          {expanded ? "Close" : "Manage"}
        </Chip>
      </div>
      {expanded && (
        <div className="space-y-3 border-t border-white/5 bg-surface-950/40 px-4 py-4">
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <form onSubmit={addGuest} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-gray-400">
              First name
              <input
                value={first}
                onChange={(e) => setFirst(e.target.value)}
                disabled={busy}
                className="w-40 rounded-md border border-white/10 bg-surface-900 px-2 py-1 text-sm text-gray-100 focus:border-amber-400/60 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-400">
              Last name
              <input
                value={last}
                onChange={(e) => setLast(e.target.value)}
                disabled={busy}
                className="w-40 rounded-md border border-white/10 bg-surface-900 px-2 py-1 text-sm text-gray-100 focus:border-amber-400/60 focus:outline-none"
              />
            </label>
            <Button type="submit" variant="primary" size="sm" loading={busy} disabled={busy}>
              Add guest
            </Button>
          </form>
          {guests.length > 0 && (
            <ul className="flex flex-col gap-1 pt-1">
              {guests.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center gap-2 rounded-md bg-surface-900/60 px-2.5 py-1.5"
                >
                  <span className="flex-1 truncate text-sm text-gray-200">{g.name}</span>
                  {pendingDeleteId === g.id ? (
                    <>
                      <span className="text-xs text-rose-300">Delete?</span>
                      <Button
                        variant="danger"
                        size="xs"
                        onClick={() => removeGuest(g.id)}
                        disabled={busy}
                      >
                        Yes
                      </Button>
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => setPendingDeleteId(null)}
                        disabled={busy}
                      >
                        No
                      </Button>
                    </>
                  ) : (
                    <IconButton
                      variant="danger"
                      size="xs"
                      aria-label={`Delete guest ${g.name}`}
                      onClick={() => setPendingDeleteId(g.id)}
                      icon={<TrashIcon className="h-3.5 w-3.5" />}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
