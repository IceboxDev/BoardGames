import type { MatchOutcomeCoop, Participant } from "@boardgames/core/history/types";
import { useId } from "react";
import { Chip } from "../../ui/Chip";
import { Field, FieldGroup } from "../../ui/Field";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";
import { Surface } from "../../ui/Surface";
import { DND_CONDITIONS, type DndCondition, resolutionOf } from "../dnd";
import { ParticipantPicker } from "../ParticipantPicker";
import { PlayerRow } from "../PlayerRow";

type User = { id: string; name: string };
type CoopPlayer = MatchOutcomeCoop["participants"][number];

type Props = {
  users: User[];
  value: MatchOutcomeCoop;
  onChange: (next: MatchOutcomeCoop) => void;
  /** Recorded-but-unresolved campaign names, offered in the dropdown. */
  openCampaigns: string[];
};

function withCondition(p: CoopPlayer, condition: DndCondition | undefined): CoopPlayer {
  const { condition: _drop, ...rest } = p;
  return condition === undefined ? rest : { ...rest, condition };
}

/**
 * Match-history form for Dungeons & Dragons — recorded as a co-op (the party
 * wins or loses together). Adds the three D&D-specific pieces:
 *   - a required campaign / one-shot name, with a dropdown of ongoing campaigns
 *     so a multi-session story isn't retyped each sitting;
 *   - a three-state resolution (Ongoing / Party won / Party lost) — "Ongoing" is
 *     a session that doesn't conclude the story (a two-shot's first sitting);
 *   - a per-player condition (Down / Died) — the only per-player datum;
 *   - a Dungeon Master, the non-competing player who runs the game (the same
 *     `moderator` slot Blood on the Clocktower uses for the Storyteller). The DM
 *     is NOT one of the adventurers, so they don't count toward the party.
 */
export function DndForm({ users, value, onChange, openCampaigns }: Props) {
  const campaignId = useId();
  const listId = useId();
  const dmId = useId();
  const selectedIds = value.participants.map((p) => p.userId);
  const resolution = resolutionOf(value);

  function setDm(userId: string) {
    // "" clears the DM and returns them to the party.
    if (!userId) {
      if (!value.moderator) return;
      const back = { userId: value.moderator.userId, displayName: value.moderator.displayName };
      const { moderator: _drop, ...rest } = value;
      onChange({ ...rest, participants: [...value.participants, back] });
      return;
    }
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    // Pull the new DM out of the party; return any previous DM to it.
    let participants = value.participants.filter((p) => p.userId !== user.id);
    if (value.moderator && value.moderator.userId !== user.id) {
      participants = [
        ...participants,
        { userId: value.moderator.userId, displayName: value.moderator.displayName },
      ];
    }
    onChange({ ...value, participants, moderator: { userId: user.id, displayName: user.name } });
  }

  function setParticipants(participants: Participant[]) {
    // Keep each surviving player's condition; new players start unscathed.
    const byId = new Map(value.participants.map((p) => [p.userId, p] as const));
    const next = participants.map((p) => byId.get(p.userId) ?? p);
    onChange({ ...value, participants: next });
  }

  function setResolution(next: "ongoing" | "win" | "loss") {
    if (next === "ongoing") {
      const { outcome: _drop, ...rest } = value;
      onChange(rest);
    } else {
      onChange({ ...value, outcome: next });
    }
  }

  function toggleCondition(userId: string, condition: DndCondition) {
    const next = value.participants.map((p) =>
      p.userId === userId ? withCondition(p, p.condition === condition ? undefined : condition) : p,
    );
    onChange({ ...value, participants: next });
  }

  return (
    <div className="flex flex-col gap-3">
      <Field
        label="Campaign / one-shot"
        htmlFor={campaignId}
        hint="Pick an ongoing one or type a new name"
      >
        <Input
          id={campaignId}
          list={listId}
          value={value.campaign ?? ""}
          onChange={(e) => onChange({ ...value, campaign: e.target.value })}
          placeholder="e.g. Curse of Strahd"
          autoComplete="off"
        />
        <datalist id={listId}>
          {openCampaigns.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </Field>

      <FieldGroup label="Resolution">
        <div className="flex gap-2">
          <Chip
            pressed={resolution === "ongoing"}
            tone="sky"
            size="md"
            block
            onClick={() => setResolution("ongoing")}
          >
            Ongoing
          </Chip>
          <Chip
            pressed={resolution === "win"}
            tone="emerald"
            size="md"
            block
            onClick={() => setResolution("win")}
          >
            Party won
          </Chip>
          <Chip
            pressed={resolution === "loss"}
            tone="rose"
            size="md"
            block
            onClick={() => setResolution("loss")}
          >
            Party lost
          </Chip>
        </div>
      </FieldGroup>

      <Field label="Players" htmlFor="dnd-players">
        <ParticipantPicker users={users} selectedIds={selectedIds} onChange={setParticipants} />
      </Field>

      <Field label="Dungeon Master" htmlFor={dmId} hint="Runs the game — not counted in the party">
        <Select
          id={dmId}
          compact
          value={value.moderator?.userId ?? ""}
          onChange={(e) => setDm(e.target.value)}
        >
          <option value="">— none —</option>
          {value.moderator && !users.some((u) => u.id === value.moderator?.userId) && (
            <option value={value.moderator.userId}>{value.moderator.displayName}</option>
          )}
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </Field>

      {value.participants.length > 0 && (
        <FieldGroup label="Casualties" hint="Optional — mark anyone who went down">
          <div className="flex flex-col gap-1.5">
            {value.participants.map((p) => (
              <Surface key={p.userId} variant="tile" padding="sm">
                <PlayerRow
                  name={p.displayName}
                  right={
                    <div className="flex gap-1.5">
                      {DND_CONDITIONS.map((cond) => (
                        <Chip
                          key={cond.value}
                          pressed={p.condition === cond.value}
                          tone={cond.value === "dead" ? "rose" : "amber"}
                          size="xs"
                          onClick={() => toggleCondition(p.userId, cond.value)}
                          icon={<span aria-hidden="true">{cond.icon}</span>}
                        >
                          {cond.label}
                        </Chip>
                      ))}
                    </div>
                  }
                />
              </Surface>
            ))}
          </div>
        </FieldGroup>
      )}
    </div>
  );
}
