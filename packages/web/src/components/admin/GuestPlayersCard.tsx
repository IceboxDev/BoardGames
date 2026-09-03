import { useId, useState } from "react";
import { adminMergeGuest } from "../../lib/admin";
import { authClient } from "../../lib/auth-client";
import { formatAuthError } from "../../pages/admin-coverage";
import { TrashIcon } from "../icons";
import { Button } from "../ui/Button";
import { ErrorAlert } from "../ui/ErrorAlert";
import { Field } from "../ui/Field";
import { IconButton } from "../ui/IconButton";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { AdminSection } from "./AdminSection";
import { synthesizeGuestEmail } from "./guest-email";
import { NightGuestsPanel } from "./NightGuestsCard";
import type { AdminUser } from "./types";

type Props = {
  guests: AdminUser[];
  /** Real (non-guest) members — merge targets for a guest's match history. */
  members: AdminUser[];
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
export function GuestPlayersCard({ guests, members, onChanged }: Props) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  // Merge flow: which guest row has the target picker open, and the picked id.
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const [mergeNotice, setMergeNotice] = useState<string | null>(null);
  const firstId = useId();
  const lastId = useId();

  async function mergeGuest(guest: AdminUser) {
    if (!mergeTargetId) return;
    setError(null);
    setMergeNotice(null);
    setBusy(true);
    try {
      const { matchesUpdated } = await adminMergeGuest(guest.id, mergeTargetId);
      const targetName = members.find((m) => m.id === mergeTargetId)?.name ?? "the account";
      setMergeNotice(
        `Merged ${guest.name} into ${targetName} — ${matchesUpdated} match${
          matchesUpdated === 1 ? "" : "es"
        } carried over.`,
      );
      setMergingId(null);
      setMergeTargetId("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to merge guest");
    } finally {
      setBusy(false);
    }
  }

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
    <AdminSection
      tone="amber"
      eyebrow="Guest players"
      summary={
        guests.length === 0
          ? "No guests yet — add stub accounts for people who never signed up."
          : `${guests.length} guest${guests.length === 1 ? "" : "s"} — pickable in match history, seatable on nights.`
      }
    >
      {error && <ErrorAlert message={error} />}
      {mergeNotice && <p className="text-xs text-emerald-300">{mergeNotice}</p>}
      <form onSubmit={addGuest} className="flex flex-wrap items-end gap-2">
        <Field label="First name" htmlFor={firstId}>
          <Input
            id={firstId}
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            disabled={busy}
            width="auto"
            className="w-40"
          />
        </Field>
        <Field label="Last name" htmlFor={lastId}>
          <Input
            id={lastId}
            value={last}
            onChange={(e) => setLast(e.target.value)}
            disabled={busy}
            width="auto"
            className="w-40"
          />
        </Field>
        <Button type="submit" variant="primary" size="sm" loading={busy} disabled={busy}>
          Add guest
        </Button>
      </form>
      {guests.length > 0 && (
        <ul className="flex flex-col gap-1 pt-1">
          {guests.map((g) => (
            <li key={g.id} className="rounded-md bg-surface-900/60 px-2.5 py-1.5">
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm text-fg-primary">{g.name}</span>
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
                  <>
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => {
                        setMergingId((cur) => (cur === g.id ? null : g.id));
                        setMergeTargetId("");
                        setMergeNotice(null);
                      }}
                      disabled={busy || members.length === 0}
                      title="Move this guest's match history onto a real account"
                    >
                      Merge…
                    </Button>
                    <IconButton
                      tone="rose"
                      size="xs"
                      aria-label={`Delete guest ${g.name}`}
                      onClick={() => setPendingDeleteId(g.id)}
                      icon={<TrashIcon className="h-3.5 w-3.5" />}
                    />
                  </>
                )}
              </div>
              {mergingId === g.id && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 border-t border-white/5 pt-1.5">
                  <span className="text-xs text-fg-secondary">Merge into</span>
                  <Select
                    size="sm"
                    block={false}
                    value={mergeTargetId}
                    onChange={(e) => setMergeTargetId(e.target.value)}
                    disabled={busy}
                    aria-label={`Merge target for ${g.name}`}
                  >
                    <option value="">Pick a member…</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.email}
                      </option>
                    ))}
                  </Select>
                  <Button
                    variant="primary"
                    size="xs"
                    onClick={() => mergeGuest(g)}
                    disabled={busy || !mergeTargetId}
                    loading={busy}
                  >
                    Merge
                  </Button>
                  <span className="text-2xs text-fg-muted">
                    Rewrites their matches and deletes the guest. Not undoable.
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <NightGuestsPanel guests={guests} />
    </AdminSection>
  );
}
