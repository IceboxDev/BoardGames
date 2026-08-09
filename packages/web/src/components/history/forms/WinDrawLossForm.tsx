import type { MatchOutcomeFreeForAll, Participant } from "@boardgames/core/history/types";
import { Chip } from "../../ui/Chip";
import { PlayerRow } from "../PlayerRow";
import { GroupLabel, mergeParticipants, OutcomeFormShell } from "./shared";

type User = { id: string; name: string };
type FfaPlayer = MatchOutcomeFreeForAll["players"][number];

type Props = {
  users: User[];
  value: MatchOutcomeFreeForAll;
  onChange: (next: MatchOutcomeFreeForAll) => void;
};

/**
 * Match-history form for classic head-to-head duels (chess, Connect 4 — see
 * `isWinDrawLossFfa`): a point-less free-for-all whose only outcomes are one
 * winner or a draw. Crown the winner (`rank: 1`, every score stays 0) or call
 * it a draw (`draw: true` on the outcome, nobody ranked).
 */
export function WinDrawLossForm({ users, value, onChange }: Props) {
  const selectedIds = value.players.map((p) => p.userId);

  function setParticipants(participants: Participant[]) {
    const players = mergeParticipants(value.players, participants, (p) => ({ ...p, score: 0 }));
    onChange({ ...value, players });
  }

  function crownWinner(userId: string) {
    // Crowning clears any draw; re-tapping the crowned player un-crowns them.
    const { draw: _draw, ...rest } = value;
    onChange({
      ...rest,
      players: value.players.map((p) => {
        const bare = clearRank(p);
        return p.userId === userId && p.rank !== 1 ? { ...bare, rank: 1 } : bare;
      }),
    });
  }

  function toggleDraw() {
    const players = value.players.map(clearRank);
    if (value.draw) {
      const { draw: _draw, ...rest } = value;
      onChange({ ...rest, players });
    } else {
      onChange({ ...value, players, draw: true });
    }
  }

  return (
    <OutcomeFormShell users={users} selectedIds={selectedIds} onParticipants={setParticipants}>
      {value.players.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <GroupLabel>Crown the winner — or call it a draw.</GroupLabel>
          {value.players.map((p) => (
            <PlayerRow
              key={p.userId}
              name={p.displayName}
              highlight={p.rank === 1}
              right={
                <Chip
                  pressed={p.rank === 1}
                  tone="amber"
                  size="xs"
                  onClick={() => crownWinner(p.userId)}
                  icon={<span aria-hidden="true">👑</span>}
                >
                  Winner
                </Chip>
              }
            />
          ))}
          <Chip
            pressed={value.draw === true}
            tone="accent"
            size="sm"
            block
            onClick={toggleDraw}
            icon={<span aria-hidden="true">🤝</span>}
          >
            Draw
          </Chip>
        </div>
      )}
    </OutcomeFormShell>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function clearRank(p: FfaPlayer): FfaPlayer {
  const { rank: _rank, ...rest } = p;
  return rest;
}
