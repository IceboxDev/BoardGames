import type { MatchOutcomeCoop, Participant } from "@boardgames/core/history/types";
import { useId } from "react";
import type { CoopLeaderRole } from "../../../games/match-kinds";
import { Chip } from "../../ui/Chip";
import { Field, FieldGroup } from "../../ui/Field";
import { Input } from "../../ui/Input";
import type { PickerUser } from "../ParticipantPicker";
import { mergeParticipants, OutcomeFormShell } from "./shared";

type User = PickerUser;

type Props = {
  users: User[];
  value: MatchOutcomeCoop;
  onChange: (next: MatchOutcomeCoop) => void;
  /**
   * The role one player leads the table in (The Crew's "Captain"), picked
   * among the players and stored as that participant's `role`.
   */
  leaderRole?: CoopLeaderRole | null;
};

export function CoopForm({ users, value, onChange, leaderRole }: Props) {
  const difficultyId = useId();
  const detailsId = useId();
  const selectedIds = value.participants.map((p) => p.userId);

  function setParticipants(participants: Participant[]) {
    // Keep the leader's role on whoever stays picked.
    onChange({ ...value, participants: mergeParticipants(value.participants, participants) });
  }

  function setLeader(userId: string) {
    if (!leaderRole) return;
    onChange({
      ...value,
      participants: value.participants.map(({ role: _drop, ...p }) =>
        p.userId === userId ? { ...p, role: leaderRole.label } : p,
      ),
    });
  }

  return (
    <OutcomeFormShell users={users} selectedIds={selectedIds} onParticipants={setParticipants}>
      {leaderRole && value.participants.length > 0 && (
        <FieldGroup label={leaderRole.label} hint={leaderRole.hint}>
          <div className="flex flex-wrap gap-1.5">
            {value.participants.map((p) => (
              <Chip
                key={p.userId}
                pressed={p.role === leaderRole.label}
                tone="accent"
                size="sm"
                shape="pill"
                onClick={() => setLeader(p.userId)}
              >
                {p.displayName}
              </Chip>
            ))}
          </div>
        </FieldGroup>
      )}
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
    </OutcomeFormShell>
  );
}
