import type { Participant } from "@boardgames/core/history/types";
import { useId, useState } from "react";
import { PlusIcon } from "../icons";
import { Chip } from "../ui/Chip";

/** A pickable player. Guests are stub accounts the admin added for people who never signed up. */
export type PickerUser = { id: string; name: string; guest?: boolean };

type Props = {
  users: PickerUser[];
  /** Multi-select: array of userIds. */
  selectedIds: string[];
  onChange: (next: Participant[]) => void;
  /** Optional max selection (e.g. 1 for solo). */
  max?: number;
  /** Disable the input entirely. */
  disabled?: boolean;
};

// Members are always laid out; guests sit folded behind one "N guests" chip
// so the roster stays a glance wide as the guest list grows. A guest who is
// already in the match stays visible while folded — the roster must read
// complete without unfolding — and unfolding just adds the rest after them.
export function ParticipantPicker({ users, selectedIds, onChange, max, disabled }: Props) {
  const selected = new Set(selectedIds);
  const [showGuests, setShowGuests] = useState(false);
  const guestsId = useId();
  const members = users.filter((u) => !u.guest);
  const guests = users.filter((u) => u.guest);
  const visibleGuests = showGuests ? guests : guests.filter((g) => selected.has(g.id));

  function toggle(u: PickerUser) {
    if (disabled) return;
    if (selected.has(u.id)) {
      const next = users
        .filter((x) => selected.has(x.id) && x.id !== u.id)
        .map((x) => ({ userId: x.id, displayName: x.name }));
      onChange(next);
      return;
    }
    if (max !== undefined && selected.size >= max) {
      // Single-select replacement: drop everything, add this.
      onChange([{ userId: u.id, displayName: u.name }]);
      return;
    }
    const next = [...selectedIds, u.id];
    onChange(
      users.filter((x) => next.includes(x.id)).map((x) => ({ userId: x.id, displayName: x.name })),
    );
  }

  if (users.length === 0) {
    return <p className="text-xs text-fg-muted">No users available.</p>;
  }

  const chip = (u: PickerUser) => (
    <Chip
      key={u.id}
      pressed={selected.has(u.id)}
      tone="accent"
      size="sm"
      disabled={disabled}
      onClick={() => toggle(u)}
    >
      {u.name}
    </Chip>
  );

  return (
    <div className="flex flex-wrap gap-1.5">
      {members.map(chip)}
      {guests.length > 0 && (
        <>
          <Chip
            pressed={showGuests}
            variant="outlined"
            tone="accent"
            size="sm"
            icon={<PlusIcon className="h-3 w-3" />}
            title={showGuests ? "Hide guests" : "Show guests"}
            aria-expanded={showGuests}
            aria-controls={guestsId}
            disabled={disabled}
            onClick={() => setShowGuests((v) => !v)}
          >
            {guests.length} {guests.length === 1 ? "guest" : "guests"}
          </Chip>
          <span id={guestsId} className="contents">
            {visibleGuests.map(chip)}
          </span>
        </>
      )}
    </div>
  );
}
