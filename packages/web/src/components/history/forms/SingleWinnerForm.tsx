import type { MatchOutcomeFreeForAll, Participant } from "@boardgames/core/history/types";
import { Chip } from "../../ui/Chip";
import type { PickerUser } from "../ParticipantPicker";
import { PlayerRow } from "../PlayerRow";
import { GroupLabel, mergeParticipants, OutcomeFormShell } from "./shared";

type User = PickerUser;
type FfaPlayer = MatchOutcomeFreeForAll["players"][number];

type Props = {
  users: User[];
  value: MatchOutcomeFreeForAll;
  onChange: (next: MatchOutcomeFreeForAll) => void;
};

/**
 * Match-history form for plain single-winner games (Unstable Unicorns — see
 * `isSingleWinnerFfa`): a point-less free-for-all where one player is crowned
 * (`rank: 1`, every score stays 0) and everyone else simply lost. No draw, no
 * role — the WinDrawLossForm without the handshake.
 */
export function SingleWinnerForm({ users, value, onChange }: Props) {
  const selectedIds = value.players.map((p) => p.userId);

  function setParticipants(participants: Participant[]) {
    const players = mergeParticipants(value.players, participants, (p) => ({ ...p, score: 0 }));
    onChange({ ...value, players });
  }

  function crownWinner(userId: string) {
    // Re-tapping the crowned player un-crowns them; crowning another moves the crown.
    onChange({
      ...value,
      players: value.players.map((p) => {
        const bare = clearRank(p);
        return p.userId === userId && p.rank !== 1 ? { ...bare, rank: 1 } : bare;
      }),
    });
  }

  return (
    <OutcomeFormShell users={users} selectedIds={selectedIds} onParticipants={setParticipants}>
      {value.players.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <GroupLabel>Crown the winner — everyone else lost.</GroupLabel>
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
