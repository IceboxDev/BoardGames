import {
  QUIZTOPIA_BUILDINGS,
  QUIZTOPIA_DIFFICULTIES,
} from "@boardgames/core/history/coop-challenge";
import type { MatchOutcomeCoop, Participant } from "@boardgames/core/history/types";
import { useId } from "react";
import { Chip } from "../../ui/Chip";
import { Field } from "../../ui/Field";
import { Input } from "../../ui/Input";
import { OutcomeFormShell } from "./shared";

// Quiztopia: co-op quiz over 12 buildings. Beyond the shared win/loss this
// form records the structured difficulty tier (the rulebook's four), and the
// buildings won/lost split — the margin the rating engine uses to compare
// two wins (or two losses) against each other. The Standard/Expert mode is
// the game's variant picker (match-variants.ts → `scenario`).

type User = { id: string; name: string };

type Props = {
  users: User[];
  value: MatchOutcomeCoop;
  onChange: (next: MatchOutcomeCoop) => void;
};

function parseCount(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n)) return undefined;
  return Math.max(0, Math.min(QUIZTOPIA_BUILDINGS, n));
}

export function QuiztopiaForm({ users, value, onChange }: Props) {
  const wonId = useId();
  const lostId = useId();
  const detailsId = useId();
  const selectedIds = value.participants.map((p) => p.userId);

  function setParticipants(participants: Participant[]) {
    onChange({ ...value, participants });
  }

  return (
    <OutcomeFormShell users={users} selectedIds={selectedIds} onParticipants={setParticipants}>
      <Field label="Outcome" htmlFor="quiztopia-outcome">
        <div className="flex gap-2">
          <Chip
            pressed={value.outcome === "win"}
            tone="emerald"
            size="md"
            block
            onClick={() => onChange({ ...value, outcome: "win" })}
          >
            Won together
          </Chip>
          <Chip
            pressed={value.outcome === "loss"}
            tone="rose"
            size="md"
            block
            onClick={() => onChange({ ...value, outcome: "loss" })}
          >
            Lost
          </Chip>
        </div>
      </Field>
      <Field label="Difficulty" htmlFor="quiztopia-difficulty">
        <div className="flex flex-wrap gap-2">
          {QUIZTOPIA_DIFFICULTIES.map((tier) => (
            <Chip
              key={tier}
              pressed={value.difficulty === tier}
              tone="amber"
              size="sm"
              onClick={() => onChange({ ...value, difficulty: tier })}
            >
              {tier}
            </Chip>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Buildings won" htmlFor={wonId} hint={`0–${QUIZTOPIA_BUILDINGS}`}>
          <Input
            id={wonId}
            type="number"
            min={0}
            max={QUIZTOPIA_BUILDINGS}
            value={value.score ?? ""}
            onChange={(e) => onChange({ ...value, score: parseCount(e.target.value) })}
          />
        </Field>
        <Field label="Buildings lost" htmlFor={lostId} hint={`0–${QUIZTOPIA_BUILDINGS}`}>
          <Input
            id={lostId}
            type="number"
            min={0}
            max={QUIZTOPIA_BUILDINGS}
            value={value.opponentScore ?? ""}
            onChange={(e) => onChange({ ...value, opponentScore: parseCount(e.target.value) })}
          />
        </Field>
      </div>
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
