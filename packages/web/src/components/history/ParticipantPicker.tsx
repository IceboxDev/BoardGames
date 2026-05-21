import type { Participant } from "@boardgames/core/history/types";
import { Chip } from "../ui/Chip";

type User = { id: string; name: string };

type Props = {
  users: User[];
  /** Multi-select: array of userIds. */
  selectedIds: string[];
  onChange: (next: Participant[]) => void;
  /** Optional max selection (e.g. 1 for solo). */
  max?: number;
  /** Disable the input entirely. */
  disabled?: boolean;
};

export function ParticipantPicker({ users, selectedIds, onChange, max, disabled }: Props) {
  const selected = new Set(selectedIds);

  function toggle(u: User) {
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
    return <p className="text-xs text-gray-500">No users available.</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {users.map((u) => (
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
      ))}
    </div>
  );
}
