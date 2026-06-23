import { useId, useMemo, useState } from "react";
import { useCurrentUser } from "../../hooks/useCurrentUser.ts";
import type {
  HostStats,
  HostStatsMap,
  LockedDate,
  LockHost,
  LockInForm,
} from "../../lib/calendar-locks";
import { Button } from "../ui/Button";
import { ErrorAlert } from "../ui/ErrorAlert";
import { Field } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import AddressAutocomplete from "./AddressAutocomplete";

type Props = {
  date: string;
  initialLock: LockedDate | null;
  candidates: LockHost[];
  /** Per-user hosting history (total + last date), keyed by userId. */
  hostStats?: HostStatsMap | null;
  busy?: boolean;
  error?: string | null;
  onSubmit: (form: LockInForm) => void;
  onRemove?: () => void;
  onClose: () => void;
};

export default function LockInModal({
  date,
  initialLock,
  candidates,
  hostStats = null,
  busy = false,
  error = null,
  onSubmit,
  onRemove,
  onClose,
}: Props) {
  const isEditing = initialLock !== null;
  const hostId = useId();
  const timeId = useId();
  const addressId = useId();
  const { user: viewer } = useCurrentUser();

  const [hostUserId, setHostUserId] = useState<string>(initialLock?.host?.userId ?? "");
  const [eventTime, setEventTime] = useState<string>(initialLock?.eventTime ?? "");
  const [address, setAddress] = useState<string>(initialLock?.address ?? "");
  // Default true — most nights are at the host's place, which is the
  // historical implicit assumption. Uncheck to apply the regular 3-game cap
  // to the host (used when the night is at a venue, someone else's place,
  // a holiday rental, etc).
  const [hostAtHome, setHostAtHome] = useState<boolean>(initialLock?.hostAtHome ?? true);
  const hostAtHomeId = useId();

  // Dedupe candidates by userId; preserve the first occurrence so the admin
  // appears in the list with the label they were given by the caller.
  const uniqueCandidates = useMemo(() => {
    const seen = new Set<string>();
    const out: LockHost[] = [];
    for (const c of candidates) {
      if (seen.has(c.userId)) continue;
      seen.add(c.userId);
      out.push(c);
    }
    return out;
  }, [candidates]);

  const headingDate = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number);
    if (!y || !m || !d) return date;
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }, [date]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const host = uniqueCandidates.find((c) => c.userId === hostUserId);
    onSubmit({
      hostUserId: host ? host.userId : null,
      hostName: host ? host.name : null,
      eventTime: eventTime || null,
      address: address.trim() || null,
      // Only persist the flag when there's actually a host — without one, the
      // bringing rules don't branch on it anyway.
      hostAtHome: host ? hostAtHome : null,
    });
  }

  return (
    <Modal
      onClose={onClose}
      panelClassName="max-w-md"
      eyebrow={isEditing ? "Edit lock-in" : "Lock in date"}
      title={headingDate}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <Field label="Host" htmlFor={hostId}>
            <Select
              id={hostId}
              value={hostUserId}
              onChange={(e) => setHostUserId(e.target.value)}
              disabled={busy}
            >
              <option value="">No host yet</option>
              {uniqueCandidates.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {hostOptionLabel(c, hostStats?.[c.userId], c.userId === viewer?.id)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Time" htmlFor={timeId}>
            <input
              id={timeId}
              type="time"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
              disabled={busy}
              className="w-full rounded-xl border border-white/10 bg-surface-900 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none focus:ring-1 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-60"
            />
          </Field>

          <Field label="Address" htmlFor={addressId}>
            <AddressAutocomplete
              id={addressId}
              value={address}
              onChange={setAddress}
              disabled={busy}
              placeholder="Start typing an address…"
            />
          </Field>

          {hostUserId && (
            <label
              htmlFor={hostAtHomeId}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-surface-900 px-3 py-2.5 text-sm text-white"
            >
              <input
                id={hostAtHomeId}
                type="checkbox"
                checked={hostAtHome}
                onChange={(e) => setHostAtHome(e.target.checked)}
                disabled={busy}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="font-medium">Hosting at home</span>
                <span className="text-2xs leading-snug text-fg-secondary">
                  Host's game collection is on-site. Uncheck for off-site nights (someone else's
                  place, a venue, a rental) — the host then gets the same 3-game bring cap as
                  everyone else.
                </span>
              </span>
            </label>
          )}
        </div>

        {error && <ErrorAlert message={error} className="text-center" />}

        <div className="mt-1 flex items-center justify-between gap-2">
          <div>
            {isEditing && onRemove && (
              <Button variant="danger" size="sm" onClick={onRemove} disabled={busy}>
                Remove lock
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" disabled={busy}>
              {isEditing ? "Save changes" : "Lock in"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// Build the host <option> label: name (+ "you"), how many nights they've hosted
// and when they last did — so the admin can spread hosting around.
function hostOptionLabel(c: LockHost, stats: HostStats | undefined, isYou: boolean): string {
  const base = isYou ? `${c.name} (you)` : c.name;
  if (!stats || stats.totalHosts === 0) return `${base} — never hosted`;
  const last = stats.lastHostedDate ? formatHostDate(stats.lastHostedDate) : null;
  return last
    ? `${base} — hosted ${stats.totalHosts}×, last ${last}`
    : `${base} — hosted ${stats.totalHosts}×`;
}

function formatHostDate(isoDay: string): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  if (!y || !m || !d) return isoDay;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
