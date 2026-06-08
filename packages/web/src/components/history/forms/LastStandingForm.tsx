import type { MatchOutcomeLastStanding, Participant } from "@boardgames/core/history/types";
import { Button } from "../../ui/Button";
import { Field } from "../../ui/Field";
import { ParticipantPicker } from "../ParticipantPicker";

type User = { id: string; name: string };

type Props = {
  users: User[];
  value: MatchOutcomeLastStanding;
  onChange: (next: MatchOutcomeLastStanding) => void;
};

export function LastStandingForm({ users, value, onChange }: Props) {
  const selectedIds = value.players.map((p) => p.userId);

  function setParticipants(participants: Participant[]) {
    const elimById = new Map(value.players.map((p) => [p.userId, p.eliminationOrder] as const));
    const players = participants.map((p) => ({
      ...p,
      ...(elimById.get(p.userId) !== undefined ? { eliminationOrder: elimById.get(p.userId) } : {}),
    }));
    onChange({ ...value, players });
  }

  function toggleEliminated(userId: string) {
    const player = value.players.find((p) => p.userId === userId);
    if (!player) return;
    if (player.eliminationOrder !== undefined) {
      // Revive: drop the elimination order so this player counts as a survivor.
      const players = value.players.map((p) =>
        p.userId === userId ? { userId: p.userId, displayName: p.displayName } : p,
      );
      onChange({ ...value, players });
    } else {
      // Eliminate: append to the elimination order.
      const usedOrders = value.players
        .map((p) => p.eliminationOrder)
        .filter((o): o is number => o !== undefined);
      const nextOrder = usedOrders.length === 0 ? 0 : Math.max(...usedOrders) + 1;
      const players = value.players.map((p) =>
        p.userId === userId ? { ...p, eliminationOrder: nextOrder } : p,
      );
      onChange({ ...value, players });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Players" htmlFor="ls-players">
        <ParticipantPicker users={users} selectedIds={selectedIds} onChange={setParticipants} />
      </Field>
      {value.players.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-fg-secondary">
            Eliminate each player in order. Whoever's left standing wins.
          </span>
          {value.players.map((p) => {
            const eliminated = p.eliminationOrder !== undefined;
            return (
              <div key={p.userId} className="flex items-center gap-2">
                <span
                  className={`flex-1 truncate text-sm ${
                    eliminated ? "text-fg-muted line-through" : "text-amber-100"
                  }`}
                >
                  {p.displayName}
                </span>
                {eliminated ? (
                  <span className="text-xs text-fg-muted">
                    out #{(p.eliminationOrder ?? 0) + 1}
                  </span>
                ) : (
                  <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wide text-amber-200">
                    Surviving
                  </span>
                )}
                <Button variant="secondary" size="xs" onClick={() => toggleEliminated(p.userId)}>
                  {eliminated ? "Revive" : "Eliminate"}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
