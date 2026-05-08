import type { MatchOutcomeFreeForAll, Participant } from "@boardgames/core/history/types";
import { lowScoreWinsForSlug } from "../../../games/score-config";
import { Field } from "../../ui/Field";
import { Input } from "../../ui/Input";
import { ParticipantPicker } from "../ParticipantPicker";

type User = { id: string; name: string };

type Props = {
  users: User[];
  value: MatchOutcomeFreeForAll;
  onChange: (next: MatchOutcomeFreeForAll) => void;
  /** Used to flip the win direction for games like Phase 10 (lowest wins). */
  gameSlug: string | null;
};

export function FreeForAllForm({ users, value, onChange, gameSlug }: Props) {
  const selectedIds = value.players.map((p) => p.userId);
  const lowestWins = lowScoreWinsForSlug(gameSlug);
  const winningScore =
    value.players.length === 0
      ? null
      : lowestWins
        ? Math.min(...value.players.map((p) => p.score))
        : Math.max(...value.players.map((p) => p.score));

  function setParticipants(participants: Participant[]) {
    const scoreById = new Map(value.players.map((p) => [p.userId, p.score]));
    const players = participants.map((p) => ({
      ...p,
      score: scoreById.get(p.userId) ?? 0,
    }));
    onChange({ ...value, players });
  }

  function setScore(userId: string, raw: string) {
    const num = Number.parseFloat(raw);
    const score = Number.isFinite(num) ? num : 0;
    const players = value.players.map((p) => (p.userId === userId ? { ...p, score } : p));
    onChange({ ...value, players });
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Players" htmlFor="ffa-players">
        <ParticipantPicker users={users} selectedIds={selectedIds} onChange={setParticipants} />
      </Field>
      {value.players.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Enter each player's score. {lowestWins ? "Lowest" : "Highest"} wins (ties allowed).
          </span>
          {value.players.map((p) => {
            const isLeading = winningScore !== null && p.score === winningScore;
            return (
              <div key={p.userId} className="flex items-center gap-2">
                <span
                  className={`flex-1 truncate text-sm ${
                    isLeading ? "text-amber-200" : "text-gray-200"
                  }`}
                >
                  {p.displayName}
                </span>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={p.score}
                  onChange={(e) => setScore(p.userId, e.target.value)}
                  className="!w-24 text-right"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
