import type { MatchOutcomeOneVsMany, Participant } from "@boardgames/core/history/types";
import { useId } from "react";
import { Field } from "../../ui/Field";
import { Input } from "../../ui/Input";
import { ParticipantPicker } from "../ParticipantPicker";

type User = { id: string; name: string };

type Props = {
  users: User[];
  value: MatchOutcomeOneVsMany;
  onChange: (next: MatchOutcomeOneVsMany) => void;
};

export function OneVsManyForm({ users, value, onChange }: Props) {
  const soloLabelId = useId();
  const teamLabelId = useId();

  function setSolo(participants: Participant[]) {
    const p = participants[0];
    if (!p) return;
    // Drop from team if they were there.
    const team = value.team.members.filter((m) => m.userId !== p.userId);
    onChange({
      ...value,
      solo: {
        userId: p.userId,
        displayName: p.displayName,
        ...(value.solo.roleLabel ? { roleLabel: value.solo.roleLabel } : {}),
      },
      team: { ...value.team, members: team },
    });
  }

  function setTeam(participants: Participant[]) {
    const filtered = participants.filter((p) => p.userId !== value.solo.userId);
    onChange({ ...value, team: { ...value.team, members: filtered } });
  }

  const soloEmpty = value.solo.userId === "";

  return (
    <div className="flex flex-col gap-3">
      <Field
        label={value.solo.roleLabel ? `Solo (${value.solo.roleLabel})` : "Solo player"}
        htmlFor="ovm-solo"
        hint="Pick exactly one"
      >
        <ParticipantPicker
          users={users}
          selectedIds={soloEmpty ? [] : [value.solo.userId]}
          onChange={setSolo}
          max={1}
        />
      </Field>
      <Field label="Solo role label" htmlFor={soloLabelId} hint="Optional, e.g. Mr. X">
        <Input
          id={soloLabelId}
          value={value.solo.roleLabel ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              solo: { ...value.solo, roleLabel: e.target.value || undefined },
            })
          }
          placeholder="Mr. X / Werewolf / Traitor"
        />
      </Field>
      <Field
        label={value.team.roleLabel ? `Team (${value.team.roleLabel})` : "Team players"}
        htmlFor="ovm-team"
      >
        <ParticipantPicker
          users={users.filter((u) => u.id !== value.solo.userId)}
          selectedIds={value.team.members.map((m) => m.userId)}
          onChange={setTeam}
        />
      </Field>
      <Field label="Team role label" htmlFor={teamLabelId} hint="Optional, e.g. Detectives">
        <Input
          id={teamLabelId}
          value={value.team.roleLabel ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              team: { ...value.team, roleLabel: e.target.value || undefined },
            })
          }
          placeholder="Detectives / Village / Crew"
        />
      </Field>
      <Field label="Winner side" htmlFor="ovm-winner">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...value, winnerSide: "solo" })}
            disabled={soloEmpty}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
              value.winnerSide === "solo"
                ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40"
                : "bg-surface-800 text-gray-400 hover:bg-surface-700"
            }`}
          >
            {value.solo.roleLabel ?? "Solo"} won
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...value, winnerSide: "team" })}
            disabled={value.team.members.length === 0}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
              value.winnerSide === "team"
                ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40"
                : "bg-surface-800 text-gray-400 hover:bg-surface-700"
            }`}
          >
            {value.team.roleLabel ?? "Team"} won
          </button>
        </div>
      </Field>
    </div>
  );
}
