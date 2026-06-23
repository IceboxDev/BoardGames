import type { MatchOutcomeCoop, Participant } from "@boardgames/core/history/types";
import { useEffect } from "react";
import { JUST_ONE_SCORES, justOneTier } from "../../../games/just-one/scoring";
import { Chip } from "../../ui/Chip";
import { Field } from "../../ui/Field";
import { Surface } from "../../ui/Surface";
import { ParticipantPicker } from "../ParticipantPicker";

type User = { id: string; name: string };

type Props = {
  users: User[];
  value: MatchOutcomeCoop;
  onChange: (next: MatchOutcomeCoop) => void;
};

/**
 * Match-history form for Just One — a cooperative game with NO winner. The team
 * banks 0–13 points; the score maps to a flavour tier (see `just-one/scoring`).
 * Recorded as a scored co-op: `score` is set and the binary `outcome` is left
 * off entirely (`emptyOutcome` seeds a default "win" for the coop kind, which
 * this form strips on mount).
 */
export function JustOneForm({ users, value, onChange }: Props) {
  const selectedIds = value.participants.map((p) => p.userId);

  // Just One has no win/loss — drop the default coop `outcome` so the saved
  // record is purely score-based. Guarded so it only writes once.
  useEffect(() => {
    if (value.outcome === undefined) return;
    const { outcome: _drop, ...rest } = value;
    onChange(rest);
  }, [value, onChange]);

  function setParticipants(participants: Participant[]) {
    onChange({ ...value, participants });
  }

  function setScore(score: number) {
    const { outcome: _drop, ...rest } = value;
    onChange({ ...rest, score });
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Players" htmlFor="just-one-players">
        <ParticipantPicker users={users} selectedIds={selectedIds} onChange={setParticipants} />
      </Field>

      <Field label="Score" htmlFor="just-one-score" hint="Cards guessed correctly (0–13)">
        <div className="flex flex-wrap gap-1.5">
          {JUST_ONE_SCORES.map((n) => (
            <Chip
              key={n}
              pressed={value.score === n}
              tone="accent"
              size="sm"
              onClick={() => setScore(n)}
            >
              {n}
            </Chip>
          ))}
        </div>
      </Field>

      {value.score !== undefined && (
        <Surface
          variant="tile"
          padding="sm"
          className="flex flex-col items-center gap-0.5 text-center"
        >
          <span className="font-bold text-amber-200">
            <span className="text-2xl">{value.score}</span>
            <span className="text-sm text-fg-muted"> / 13</span>
          </span>
          <span className="text-sm text-fg-secondary">{justOneTier(value.score)}</span>
        </Surface>
      )}
    </div>
  );
}
