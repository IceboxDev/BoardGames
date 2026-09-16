import {
  MAX_SEAT_COUNT,
  MIN_SEAT_COUNT,
  type ProfileDirectoryEntry,
} from "@boardgames/core/protocol";
import { useId, useMemo, useState } from "react";
import { useCurrentUser } from "../../hooks/useCurrentUser.ts";
import type {
  HostStats,
  HostStatsMap,
  LockedDate,
  LockHost,
  LockInForm,
  PickMode,
} from "../../lib/calendar-locks";
import { formatDayKey } from "../../lib/date-format.ts";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { ErrorAlert } from "../ui/ErrorAlert";
import { Field, FieldGroup } from "../ui/Field";
import { Input } from "../ui/Input";
import { MemberPicker } from "../ui/MemberPicker";
import { Modal, ModalBody, ModalFooter } from "../ui/Modal";
import { SegmentedControl, type SegmentedOption } from "../ui/SegmentedControl";
import { Select } from "../ui/Select";
import { Stepper } from "../ui/Stepper";
import AddressAutocomplete from "./AddressAutocomplete";
import { PICK_MODE_OPTIONS, pickModeHint } from "./private-night-copy";

type NightKind = "open" | "private";
const KIND_OPTIONS: SegmentedOption<NightKind>[] = [
  { value: "open", label: "Open night", tone: "amber", title: "Anyone who's free can come" },
  {
    value: "private",
    label: "Private night",
    tone: "accent",
    title: "Invitation only, seat-capped",
  },
];
const DEFAULT_SEATS = 5;

type Props = {
  date: string;
  initialLock: LockedDate | null;
  candidates: LockHost[];
  /** The member directory — a private night's guest list is picked from it. */
  members?: readonly ProfileDirectoryEntry[];
  /** Members who marked can/maybe that day: listed first and pre-checked. */
  suggestedInviteeIds?: ReadonlySet<string>;
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
  members = [],
  suggestedInviteeIds,
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
  const titleId = useId();

  // Private night: a seat count (host included), how games get picked, an
  // optional title, and the guest list. A fresh private night pre-checks
  // whoever marked the day free — the likeliest guests, one glance away.
  const [kind, setKind] = useState<NightKind>(initialLock?.isPrivate ? "private" : "open");
  const isPrivate = kind === "private";
  const [seatCount, setSeatCount] = useState<number>(initialLock?.seats?.total ?? DEFAULT_SEATS);
  const [pickMode, setPickMode] = useState<PickMode>(
    initialLock?.isPrivate ? initialLock.pickMode : "host",
  );
  const [title, setTitle] = useState<string>(initialLock?.title ?? "");
  const [invitees, setInvitees] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        initialLock?.isPrivate
          ? initialLock.expectedUserIds.filter((id) => id !== initialLock.host?.userId)
          : [...(suggestedInviteeIds ?? [])],
      ),
  );
  const memberRows = useMemo(
    () =>
      members
        .filter((m) => m.id !== hostUserId)
        .map((m) => ({ id: m.id, name: m.name, image: m.image, accentHex: m.accentHex })),
    [members, hostUserId],
  );
  const inviteeCount = [...invitees].filter((id) => id !== hostUserId).length;

  // Dedupe candidates by userId; preserve the first occurrence so the admin
  // appears in the list with the label they were given by the caller. An
  // open night is hosted by someone who marked the day (the candidates); a
  // private night may be hosted by anyone, so there the rest of the
  // directory follows. The lock's current host always stays pickable.
  const uniqueCandidates = useMemo(() => {
    const seen = new Set<string>();
    const out: LockHost[] = [];
    const push = (c: LockHost) => {
      if (seen.has(c.userId)) return;
      seen.add(c.userId);
      out.push(c);
    };
    for (const c of candidates) push(c);
    if (initialLock?.host) push(initialLock.host);
    if (isPrivate) for (const m of members) push({ userId: m.id, name: m.name });
    return out;
  }, [candidates, initialLock, isPrivate, members]);

  const headingDate = formatDayKey(date, "weekday");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const host = uniqueCandidates.find((c) => c.userId === hostUserId);
    if (isPrivate && !host) return;
    onSubmit({
      hostUserId: host ? host.userId : null,
      hostName: host ? host.name : null,
      eventTime: eventTime || null,
      address: address.trim() || null,
      // Only persist the flag when there's actually a host — without one, the
      // bringing rules don't branch on it anyway.
      hostAtHome: host ? hostAtHome : null,
      isPrivate,
      ...(isPrivate
        ? {
            seatCount,
            pickMode,
            title: title.trim() || null,
            inviteeIds: [...invitees].filter((id) => id !== host?.userId),
          }
        : {}),
    });
  }

  const hostChanged =
    isEditing &&
    initialLock?.isPrivate &&
    initialLock.host &&
    hostUserId !== "" &&
    hostUserId !== initialLock.host.userId;

  return (
    <Modal
      onClose={onClose}
      size={isPrivate ? "sm" : "xs"}
      eyebrow={isEditing ? "Edit lock-in" : "Lock in date"}
      title={headingDate}
    >
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
        <ModalBody>
          <SegmentedControl
            shape="pill"
            size="sm"
            fullWidth
            aria-label="Night kind"
            value={kind}
            onChange={setKind}
            options={KIND_OPTIONS}
            disabled={busy}
          />

          <Field
            label={isPrivate ? "Host (required)" : "Host"}
            htmlFor={hostId}
            hint={hostChanged ? "The previous host keeps their seat as a guest." : undefined}
          >
            <Select
              id={hostId}
              value={hostUserId}
              onChange={(e) => setHostUserId(e.target.value)}
              disabled={busy}
              required={isPrivate}
            >
              <option value="">{isPrivate ? "Pick a host…" : "No host yet"}</option>
              {uniqueCandidates.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {hostOptionLabel(c, hostStats?.[c.userId], c.userId === viewer?.id)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Time" htmlFor={timeId}>
            <Input
              id={timeId}
              type="time"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
              disabled={busy}
              className="[&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-60"
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
              className="flex cursor-pointer items-start gap-3 rounded-card-xl border border-line bg-surface-900 px-3 py-2.5 text-sm text-fg-strong"
            >
              <Checkbox
                id={hostAtHomeId}
                tone="emerald"
                checked={hostAtHome}
                onChange={(e) => setHostAtHome(e.target.checked)}
                disabled={busy}
                className="mt-0.5 cursor-pointer"
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

          {isPrivate && (
            <>
              <FieldGroup label="Seats" hint={`${seatCount} seats, host included`}>
                <Stepper
                  size="sm"
                  label="Seats"
                  value={seatCount}
                  min={MIN_SEAT_COUNT}
                  max={MAX_SEAT_COUNT}
                  onChange={setSeatCount}
                  disabled={busy}
                />
              </FieldGroup>

              <FieldGroup label="Games" hint={pickModeHint(pickMode)}>
                <SegmentedControl
                  shape="pill"
                  size="sm"
                  fullWidth
                  aria-label="How games get picked"
                  value={pickMode}
                  onChange={setPickMode}
                  options={PICK_MODE_OPTIONS}
                  disabled={busy}
                />
              </FieldGroup>

              <Field label="Title (optional)" htmlFor={titleId}>
                <Input
                  id={titleId}
                  value={title}
                  maxLength={80}
                  placeholder="TI4 marathon, Cthulhu night…"
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={busy}
                />
              </Field>

              <FieldGroup
                label="Guest list"
                hint={
                  inviteeCount === 0
                    ? "Nobody invited yet — the host can add people later."
                    : `${inviteeCount} invited · seats go first come, first served.`
                }
              >
                <MemberPicker
                  members={memberRows}
                  selectedIds={invitees}
                  onToggle={(id) =>
                    setInvitees((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                  suggestedIds={suggestedInviteeIds}
                  suggestionHint="Free that day"
                  selectedNoun="invited"
                  disabled={busy}
                />
              </FieldGroup>
            </>
          )}

          {error && <ErrorAlert message={error} className="text-center" />}
        </ModalBody>

        <ModalFooter
          start={
            isEditing && onRemove ? (
              <Button variant="danger" size="sm" onClick={onRemove} disabled={busy}>
                Remove lock
              </Button>
            ) : undefined
          }
        >
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            loading={busy}
            disabled={isPrivate && !hostUserId}
          >
            {isEditing ? "Save changes" : isPrivate ? "Lock in private night" : "Lock in"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// Build the host <option> label: name (+ "you"), how many nights they've hosted
// and when they last did — so the admin can spread hosting around.
function hostOptionLabel(c: LockHost, stats: HostStats | undefined, isYou: boolean): string {
  const base = isYou ? `${c.name} (you)` : c.name;
  if (!stats || stats.totalHosts === 0) return `${base} — never hosted`;
  const last = stats.lastHostedDate ? formatDayKey(stats.lastHostedDate, "compact") : null;
  return last
    ? `${base} — hosted ${stats.totalHosts}×, last ${last}`
    : `${base} — hosted ${stats.totalHosts}×`;
}
