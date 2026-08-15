import type { MatchOutcomeCoop, Participant } from "@boardgames/core/history/types";
import { useEffect, useId, useState } from "react";
import { Field } from "../../ui/Field";
import { Input } from "../../ui/Input";
import { Surface } from "../../ui/Surface";
import { OutcomeFormShell } from "./shared";

type User = { id: string; name: string };

type Props = {
  users: User[];
  value: MatchOutcomeCoop;
  onChange: (next: MatchOutcomeCoop) => void;
  /** The game's maximum attainable score (`coopMaxScoreForSlug`). */
  maxScore: number;
};

/**
 * Generic form for scored co-ops with a wide numeric range (Medical
 * Mysteries: 0–100) — the team banks points, nobody wins or loses. Just One
 * keeps its own chip-per-score form (`JustOneForm`); this one takes a typed
 * score instead. Like there, the coop kind's default binary `outcome` is
 * stripped so the saved record is purely score-based.
 */
export function ScoredCoopForm({ users, value, onChange, maxScore }: Props) {
  const selectedIds = value.participants.map((p) => p.userId);
  const scoreId = useId();
  const [scoreText, setScoreText] = useState(value.score !== undefined ? String(value.score) : "");

  // A scored co-op has no win/loss — drop the seeded default `outcome` so the
  // saved record is purely score-based. Guarded so it only writes once.
  useEffect(() => {
    if (value.outcome === undefined) return;
    const { outcome: _drop, ...rest } = value;
    onChange(rest);
  }, [value, onChange]);

  function setParticipants(participants: Participant[]) {
    onChange({ ...value, participants });
  }

  function setScoreFrom(raw: string) {
    const digits = raw.replace(/\D/g, "");
    setScoreText(digits);
    const { outcome: _drop, score: _score, ...rest } = value;
    const n = Number.parseInt(digits, 10);
    if (Number.isFinite(n) && n >= 0 && n <= maxScore) {
      onChange({ ...rest, score: n });
    } else {
      // Out-of-range/empty input: unset so validation blocks the save.
      onChange(rest);
    }
  }

  return (
    <OutcomeFormShell users={users} selectedIds={selectedIds} onParticipants={setParticipants}>
      <Field label="Team score" htmlFor={scoreId} hint={`Points banked together (0–${maxScore})`}>
        <Input
          id={scoreId}
          inputMode="numeric"
          value={scoreText}
          onChange={(e) => setScoreFrom(e.target.value)}
          placeholder={`0–${maxScore}`}
          invalid={scoreText !== "" && value.score === undefined}
          width="score"
        />
      </Field>

      {value.score !== undefined && (
        <Surface
          variant="tile"
          padding="sm"
          className="flex flex-col items-center gap-0.5 text-center"
        >
          <span className="font-bold text-amber-200">
            <span className="text-2xl">{value.score}</span>
            <span className="text-sm text-fg-muted"> / {maxScore}</span>
          </span>
        </Surface>
      )}
    </OutcomeFormShell>
  );
}
