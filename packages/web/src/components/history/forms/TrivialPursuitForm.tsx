import type { MatchOutcomeFreeForAll, Participant } from "@boardgames/core/history/types";
import { Chip } from "../../ui/Chip";
import type { PickerUser } from "../ParticipantPicker";
import { PlayerRow } from "../PlayerRow";
import { GroupLabel, mergeParticipants, OutcomeFormShell, withOptional } from "./shared";
import { WedgePicker } from "./WedgePicker";

type FfaPlayer = MatchOutcomeFreeForAll["players"][number];

type Props = {
  users: PickerUser[];
  value: MatchOutcomeFreeForAll;
  onChange: (next: MatchOutcomeFreeForAll) => void;
};

/**
 * Trivial Pursuit, every player for themselves: the pie wedges each player
 * held at the end, and ONE crowned winner (`rank: 1`, every score 0). Several
 * players can hold a full pie — only the one who then answered the final
 * question won — so the crown is picked, never derived from the wedges.
 */
export function TrivialPursuitForm({ users, value, onChange }: Props) {
  const selectedIds = value.players.map((p) => p.userId);

  function setParticipants(participants: Participant[]) {
    const players = mergeParticipants(value.players, participants, (p) => ({ ...p, score: 0 }));
    onChange({ ...value, players });
  }

  function update(userId: string, fn: (p: FfaPlayer) => FfaPlayer) {
    onChange({ ...value, players: value.players.map((p) => (p.userId === userId ? fn(p) : p)) });
  }

  function crownWinner(userId: string) {
    // Re-tapping the crowned player un-crowns them; crowning another moves the crown.
    onChange({
      ...value,
      players: value.players.map((p) => {
        const bare = withOptional(p, "rank", undefined);
        return p.userId === userId && p.rank !== 1 ? { ...bare, rank: 1 } : bare;
      }),
    });
  }

  return (
    <OutcomeFormShell users={users} selectedIds={selectedIds} onParticipants={setParticipants}>
      {value.players.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <GroupLabel>Tap the wedges each player collected, then crown the winner.</GroupLabel>
          {value.players.map((p) => (
            <div key={p.userId} className="flex flex-col gap-1">
              <PlayerRow
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
              <WedgePicker
                owner={p.displayName}
                wedges={p.wedges ?? []}
                onChange={(wedges) =>
                  update(p.userId, (prev) =>
                    withOptional(prev, "wedges", wedges.length > 0 ? wedges : undefined),
                  )
                }
              />
            </div>
          ))}
        </div>
      )}
    </OutcomeFormShell>
  );
}
