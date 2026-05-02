import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { LockedDate, LockHost, LockInForm } from "../../lib/calendar-locks";
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

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

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

  const overlay = (
    <AnimatePresence>
      <motion.div
        key="lock-in-modal"
        className="fixed inset-0 z-[200] flex items-center justify-center px-4 py-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute inset-0 cursor-default bg-surface-950/85 backdrop-blur-sm"
        />

        <motion.form
          onSubmit={handleSubmit}
          className="relative z-10 flex w-full max-w-md flex-col gap-4 rounded-3xl border border-white/10 bg-surface-900/95 p-6 shadow-2xl shadow-black/60"
          initial={{ y: 16, scale: 0.96, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: 16, scale: 0.96, opacity: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 26 }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-md p-1.5 text-gray-400 transition hover:bg-white/5 hover:text-white"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path d="M3 3l10 10M13 3l-10 10" strokeLinecap="round" />
            </svg>
          </button>

          <header className="flex flex-col gap-1 pr-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-300">
              {isEditing ? "Edit lock-in" : "Lock in date"}
            </p>
            <h2 className="text-xl font-bold tracking-tight text-white">{headingDate}</h2>
          </header>

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
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={busy}
                  className="rounded-full border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
                >
                  Remove lock
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-gray-300 transition hover:bg-white/10 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-full border border-emerald-400/60 bg-emerald-500/20 px-5 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/30 disabled:opacity-50"
              >
                {isEditing ? "Save changes" : "Lock in"}
              </button>
            </div>
          </div>
        </motion.form>
      </motion.div>
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">
        {label}
      </span>
      {children}
    </label>
  );
}
