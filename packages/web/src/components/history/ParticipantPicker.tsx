import type { Participant } from "@boardgames/core/history/types";

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
      {users.map((u) => {
        const isSelected = selected.has(u.id);
        return (
          <button
            key={u.id}
            type="button"
            disabled={disabled}
            onClick={() => toggle(u)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
              isSelected
                ? "bg-accent-500/20 text-accent-100 ring-1 ring-accent-400/50"
                : "bg-surface-800 text-gray-400 hover:bg-surface-700 hover:text-gray-200"
            }`}
          >
            {u.name}
          </button>
        );
      })}
    </div>
  );
}
