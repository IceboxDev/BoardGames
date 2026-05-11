import { useId, useMemo, useState } from "react";
import type { LockedDate, LockHost, LockInForm } from "../../lib/calendar-locks";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Modal } from "../ui/Modal";
import AddressAutocomplete from "./AddressAutocomplete";

type Props = {
  date: string;
  initialLock: LockedDate | null;
  candidates: LockHost[];
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

  const [hostUserId, setHostUserId] = useState<string>(initialLock?.host?.userId ?? "");
  const [eventTime, setEventTime] = useState<string>(initialLock?.eventTime ?? "");
  const [address, setAddress] = useState<string>(initialLock?.address ?? "");

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
            <select
              id={hostId}
              value={hostUserId}
              onChange={(e) => setHostUserId(e.target.value)}
              disabled={busy}
              className="w-full rounded-xl border border-white/10 bg-surface-900 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none focus:ring-1 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">No host yet</option>
              {uniqueCandidates.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.name}
                </option>
              ))}
            </select>
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
        </div>

        {error && <p className="text-center text-xs text-rose-400">{error}</p>}

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
