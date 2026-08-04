import type { MatchOutcomeFreeForAll, Participant } from "@boardgames/core/history/types";
import { Chip } from "../../ui/Chip";
import { Surface } from "../../ui/Surface";
import { PlayerRow } from "../PlayerRow";
import {
  GroupLabel,
  mergeParticipants,
  OutcomeFormShell,
  RoleChipRow,
  withOptional,
} from "./shared";

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
    const players = mergeParticipants(value.players, participants, (p) => ({ ...p, score: 0 }));
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
      p.userId === userId
        ? withOptional(p, "role", p.role === condition ? undefined : condition)
        : p,
    );
    onChange({ ...value, players });
  }

  return (
    <OutcomeFormShell users={users} selectedIds={selectedIds} onParticipants={setParticipants}>
      {value.players.length > 0 && (
        <div className="flex flex-col gap-2">
          <GroupLabel>Crown the winner, then pick how they won.</GroupLabel>
          {value.players.map((p) => {
            const isWinner = p.rank === 1;
            return (
              <Surface key={p.userId} variant="tile" padding="sm" className="flex flex-col gap-1.5">
                <PlayerRow
                  name={p.displayName}
                  highlight={isWinner}
                  right={
                    <Chip
                      pressed={isWinner}
                      tone="amber"
                      size="xs"
                      onClick={() => setWinner(p.userId)}
                      icon={<span aria-hidden="true">👑</span>}
                    >
                      Winner
                    </Chip>
                  }
                />
                {isWinner && (
                  <RoleChipRow
                    roster={WIN_CONDITIONS}
                    current={p.role}
                    onToggle={(c) => setWinCondition(p.userId, c)}
                  />
                )}
              </Surface>
            );
          })}
        </div>
      )}
    </OutcomeFormShell>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Strip both winner markers — a non-winner has neither a rank nor a win condition. */
function clearWin(p: FfaPlayer): FfaPlayer {
  const { rank: _rank, role: _role, ...rest } = p;
  return rest;
}
