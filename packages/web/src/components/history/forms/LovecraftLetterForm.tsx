import type { MatchOutcomeFreeForAll, Participant } from "@boardgames/core/history/types";
import { Chip } from "../../ui/Chip";
import { Field } from "../../ui/Field";
import { ParticipantPicker } from "../ParticipantPicker";

type User = { id: string; name: string };
type FfaPlayer = MatchOutcomeFreeForAll["players"][number];

type Props = {
  users: User[];
  value: MatchOutcomeFreeForAll;
  onChange: (next: MatchOutcomeFreeForAll) => void;
};

// The three win conditions — stored on the winner's `role` so they show next to
// the winner in the history (like a Villainous villain / Dungeon Mayhem hero).
const WIN_CONDITIONS = ["2 Sane", "3 Insane", "Cthulhu (Insane)"] as const;

/**
 * Match-history form for Lovecraft Letter — a point-less free-for-all. No scores:
 * crown the winner and record WHICH win condition they won by (2 Sanity tokens
 * while Sane, 3 while Insane, or Cthulhu's Insane effect). The win condition is
 * stored on the winner (`role`, `rank: 1`); the edition stays "Standard".
 */
export function LovecraftLetterForm({ users, value, onChange }: Props) {
  const selectedIds = value.players.map((p) => p.userId);

  function setParticipants(participants: Participant[]) {
    const byId = new Map(value.players.map((p) => [p.userId, p] as const));
    const players = participants.map((p) => {
      const prev = byId.get(p.userId);
      return prev ? { ...prev, ...p } : { ...p, score: 0 };
    });
    onChange({ ...value, players });
  }

  function setWinner(userId: string) {
    const players = value.players.map((p) => {
      if (p.userId === userId) return p.rank === 1 ? clearWin(p) : { ...clearWin(p), rank: 1 };
      return clearWin(p); // only the winner carries a rank + win condition
    });
    onChange({ ...value, players });
  }

  function setWinCondition(userId: string, condition: string) {
    const players = value.players.map((p) =>
      p.userId === userId ? withRole(p, p.role === condition ? undefined : condition) : p,
    );
    onChange({ ...value, players });
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Players" htmlFor="lovecraft-players">
        <ParticipantPicker users={users} selectedIds={selectedIds} onChange={setParticipants} />
      </Field>

      {value.players.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-fg-secondary">
            Crown the winner, then pick how they won.
          </span>
          {value.players.map((p) => {
            const isWinner = p.rank === 1;
            return (
              <div
                key={p.userId}
                className="flex flex-col gap-1.5 rounded-md border border-white/5 bg-surface-900/40 p-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex-1 truncate text-sm ${
                      isWinner ? "text-amber-200" : "text-fg-primary"
                    }`}
                  >
                    {p.displayName}
                  </span>
                  <Chip
                    pressed={isWinner}
                    tone="amber"
                    size="xs"
                    onClick={() => setWinner(p.userId)}
                    icon={<span aria-hidden="true">👑</span>}
                  >
                    Winner
                  </Chip>
                </div>
                {isWinner && (
                  <div className="flex flex-wrap gap-1.5">
                    {WIN_CONDITIONS.map((c) => (
                      <Chip
                        key={c}
                        pressed={p.role === c}
                        tone="accent"
                        variant="outlined"
                        size="xs"
                        onClick={() => setWinCondition(p.userId, c)}
                      >
                        {c}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────
function withRole(p: FfaPlayer, role: string | undefined): FfaPlayer {
  if (role === undefined) {
    const { role: _drop, ...rest } = p;
    return rest;
  }
  return { ...p, role };
}

/** Strip both winner markers — a non-winner has neither a rank nor a win condition. */
function clearWin(p: FfaPlayer): FfaPlayer {
  const { rank: _rank, role: _role, ...rest } = p;
  return rest;
}
