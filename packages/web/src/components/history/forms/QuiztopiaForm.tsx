import {
  challengeTierIndex,
  inferQuiztopiaOutcome,
  QUIZTOPIA_BUILDINGS,
  QUIZTOPIA_DIFFICULTIES,
  QUIZTOPIA_REQUIRED,
  QUIZTOPIA_SLUG,
  quiztopiaLossAt,
} from "@boardgames/core/history/coop-challenge";
import type { MatchOutcomeCoop, Participant } from "@boardgames/core/history/types";
import { useId } from "react";
import { Chip } from "../../ui/Chip";
import { Field } from "../../ui/Field";
import { Input } from "../../ui/Input";
import { OutcomeFormShell } from "./shared";

// Quiztopia: co-op quiz over 12 buildings. Only three things are ENTERED —
// difficulty tier, buildings won, buildings lost; the win/loss is implied
// (reaching the tier's required count wins, anything short lost) and shown
// back as a computed line, never asked. The Standard/Expert mode is the
// game's variant picker (match-variants.ts → `scenario`); the counts double
// as the rating engine's win margin.

type User = { id: string; name: string };

type Props = {
  users: User[];
  value: MatchOutcomeCoop;
  onChange: (next: MatchOutcomeCoop) => void;
};

function parseCount(raw: string, max: number): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n)) return undefined;
  return Math.max(0, Math.min(max, n));
}

export function QuiztopiaForm({ users, value, onChange }: Props) {
  const wonId = useId();
  const lostId = useId();
  const detailsId = useId();
  const selectedIds = value.participants.map((p) => p.userId);
  const tier = challengeTierIndex(QUIZTOPIA_SLUG, value.difficulty);
  const required = tier !== null ? QUIZTOPIA_REQUIRED[tier] : null;
  // Losses cap at the count that ends the game; wins can run past `required`
  // only on a whole-bakery attempt, so the pair can never exceed 12 total.
  const maxLost = tier !== null ? quiztopiaLossAt(tier) : QUIZTOPIA_BUILDINGS;

  function setParticipants(participants: Participant[]) {
    onChange({ ...value, participants });
  }

  /** Every edit re-derives the implied outcome alongside the change. */
  function commit(next: MatchOutcomeCoop) {
    const inferred = inferQuiztopiaOutcome(next.difficulty, next.score, next.opponentScore);
    onChange({ ...next, outcome: inferred ?? undefined });
  }

  const outcome = inferQuiztopiaOutcome(value.difficulty, value.score, value.opponentScore);

  return (
    <OutcomeFormShell users={users} selectedIds={selectedIds} onParticipants={setParticipants}>
      <Field label="Difficulty" htmlFor="quiztopia-difficulty">
        <div className="flex flex-wrap gap-2">
          {QUIZTOPIA_DIFFICULTIES.map((d) => (
            <Chip
              key={d}
              pressed={value.difficulty === d}
              tone="amber"
              size="sm"
              onClick={() => commit({ ...value, difficulty: d })}
            >
              {d}
            </Chip>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field
          label="Buildings won"
          htmlFor={wonId}
          hint={required !== null ? `${required} wins it` : "pick a difficulty"}
        >
          <Input
            id={wonId}
            type="number"
            min={0}
            max={QUIZTOPIA_BUILDINGS}
            value={value.score ?? ""}
            onChange={(e) =>
              commit({ ...value, score: parseCount(e.target.value, QUIZTOPIA_BUILDINGS) })
            }
          />
        </Field>
        <Field
          label="Buildings lost"
          htmlFor={lostId}
          hint={required !== null ? `${maxLost} ends it` : "pick a difficulty"}
        >
          <Input
            id={lostId}
            type="number"
            min={0}
            max={maxLost}
            value={value.opponentScore ?? ""}
            onChange={(e) =>
              commit({ ...value, opponentScore: parseCount(e.target.value, maxLost) })
            }
          />
        </Field>
      </div>
      {outcome !== null && (
        <p
          className={`text-xs font-medium ${outcome === "win" ? "text-emerald-300" : "text-rose-300"}`}
        >
          {outcome === "win"
            ? value.score === QUIZTOPIA_BUILDINGS
              ? "→ Won together — the whole bakery!"
              : "→ Won together"
            : "→ Lost — Quiztopia falls to the dark side"}
        </p>
      )}
      <Field label="Details" htmlFor={detailsId} hint="Optional notes about how it went">
        <Input
          id={detailsId}
          value={value.details ?? ""}
          onChange={(e) => onChange({ ...value, details: e.target.value || undefined })}
          placeholder="e.g. whole bakery attempt fell one building short"
        />
      </Field>
    </OutcomeFormShell>
  );
}
