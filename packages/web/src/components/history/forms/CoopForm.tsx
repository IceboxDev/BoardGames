import type { MatchOutcomeCoop, Participant } from "@boardgames/core/history/types";
import { useId } from "react";
import { Chip } from "../../ui/Chip";
import { Field } from "../../ui/Field";
import { Input } from "../../ui/Input";
import { ParticipantPicker } from "../ParticipantPicker";

type User = { id: string; name: string };

type Props = {
  users: User[];
  value: MatchOutcomeCoop;
  onChange: (next: MatchOutcomeCoop) => void;
};

export function CoopForm({ users, value, onChange }: Props) {
  const difficultyId = useId();
  const detailsId = useId();
  const selectedIds = value.participants.map((p) => p.userId);

  function setParticipants(participants: Participant[]) {
    onChange({ ...value, participants });
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Players" htmlFor="coop-players">
        <ParticipantPicker users={users} selectedIds={selectedIds} onChange={setParticipants} />
      </Field>
      <Field label="Outcome" htmlFor="coop-outcome">
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
      <Field label="Difficulty" htmlFor={difficultyId} hint="Optional, free text">
        <Input
          id={difficultyId}
          value={value.difficulty ?? ""}
          onChange={(e) => onChange({ ...value, difficulty: e.target.value || undefined })}
          placeholder="e.g. Heroic, 5 epidemics"
        />
      </Field>
      <Field label="Details" htmlFor={detailsId} hint="Optional notes about how it went">
        <Input
          id={detailsId}
          value={value.details ?? ""}
          onChange={(e) => onChange({ ...value, details: e.target.value || undefined })}
          placeholder="e.g. lost to outbreak chain in Asia"
        />
      </Field>
    </div>
  );
}
