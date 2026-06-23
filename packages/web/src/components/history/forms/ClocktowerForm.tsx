import type { MatchOutcomeTeams, Participant } from "@boardgames/core/history/types";
import { useId, useState } from "react";
import {
  CLOCKTOWER_EDITIONS,
  type ClocktowerEdition,
  charactersByCategory,
  clocktowerAlignment,
  detectClocktowerEdition,
  fabledByGroup,
  findClocktowerCharacter,
} from "../../../games/blood-on-the-clocktower/characters";
import { Chip } from "../../ui/Chip";
import { Select } from "../../ui/Select";
import { ParticipantPicker } from "../ParticipantPicker";
import { PlayerRow } from "../PlayerRow";

type User = { id: string; name: string };

type Props = {
  users: User[];
  value: MatchOutcomeTeams;
  onChange: (next: MatchOutcomeTeams) => void;
};

type Slot = { userId: string; displayName: string; role?: string };

/**
 * Match-history form for Blood on the Clocktower. Players get assigned a
 * character from one of the three base-set editions; the Good / Evil teams
 * fall out automatically from the character's category. The wire shape is
 * still the generic `MatchOutcomeTeams` so the rest of the history pipeline
 * (storage, MatchCard rendering, edit/delete) works unchanged.
 */
export function ClocktowerForm({ users, value, onChange }: Props) {
  // Flatten the wire shape into a single roster the UI works with. Order is
  // stabilized by display name so a player's row doesn't jump between Good and
  // Evil when their character changes.
  const roster = flattenRoster(value);
  const selectedIds = roster.map((s) => s.userId);
  const allRoles = roster.map((s) => s.role);

  // Edition is implied by the assigned characters whenever possible. Local
  // state only matters before any roles are assigned, or after a reset.
  const detected = detectClocktowerEdition(allRoles);
  const [editionState, setEditionState] = useState<ClocktowerEdition>(
    detected ?? "trouble-brewing",
  );
  const edition: ClocktowerEdition = detected ?? editionState;

  const winnerSide: "good" | "evil" | null =
    value.winnerTeamIndices.length === 0
      ? null
      : value.winnerTeamIndices.includes(GOOD_INDEX)
        ? "good"
        : "evil";

  function commitRoster(
    next: Slot[],
    {
      winnerTeamIndices = value.winnerTeamIndices,
      moderator = value.moderator,
    }: { winnerTeamIndices?: number[]; moderator?: MatchOutcomeTeams["moderator"] } = {},
  ) {
    onChange(projectToOutcome(next, winnerTeamIndices, moderator));
  }

  function setPlayers(participants: Participant[]) {
    const roleById = new Map(roster.map((s) => [s.userId, s.role] as const));
    const next: Slot[] = participants.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      role: roleById.get(p.userId),
    }));
    commitRoster(next);
  }

  function setRole(userId: string, role: string | undefined) {
    const next = roster.map((s) => (s.userId === userId ? { ...s, role } : s));
    commitRoster(next);
  }

  function setEdition(next: ClocktowerEdition) {
    setEditionState(next);
    if (next === edition) return;
    // Switching editions invalidates every existing character pick because
    // characters are edition-specific. Clear them rather than leaving stale
    // roles that no longer appear in the dropdown. The Storyteller's Fabled
    // pick is edition-agnostic, so it survives the switch.
    const cleared = roster.map((s) => ({ userId: s.userId, displayName: s.displayName }));
    commitRoster(cleared, { winnerTeamIndices: [] });
  }

  function setWinner(side: "good" | "evil") {
    onChange({ ...value, winnerTeamIndices: [side === "good" ? GOOD_INDEX : EVIL_INDEX] });
  }

  function setStoryteller(user: User | null) {
    if (!user) {
      onChange({ ...value, moderator: undefined });
      return;
    }
    // Same player can't hold both a seat and the Storyteller chair. Drop them
    // from the roster if they were a regular player.
    const stripped = roster.filter((s) => s.userId !== user.id);
    const moderator = {
      userId: user.id,
      displayName: user.name,
      ...(value.moderator?.role ? { role: value.moderator.role } : {}),
    };
    commitRoster(stripped, { moderator });
  }

  function setStorytellerFabled(fabled: string | undefined) {
    if (!value.moderator) return;
    const moderator = fabled
      ? { ...value.moderator, role: fabled }
      : { userId: value.moderator.userId, displayName: value.moderator.displayName };
    onChange({ ...value, moderator });
  }

  const groups = charactersByCategory(edition);
  const goodCount = roster.filter((s) => alignmentOf(s.role) === "good").length;
  const evilCount = roster.filter((s) => alignmentOf(s.role) === "evil").length;
  const unassignedCount = roster.filter((s) => !findClocktowerCharacter(s.role)).length;

  const playerUsers = value.moderator
    ? users.filter((u) => u.id !== value.moderator?.userId)
    : users;

  return (
    <div className="flex flex-col gap-3">
      <EditionPicker edition={edition} onChange={setEdition} />

      <StorytellerPicker
        users={users}
        moderator={value.moderator}
        onChangeStoryteller={setStoryteller}
        onChangeFabled={setStorytellerFabled}
      />

      <div>
        <Label>Players</Label>
        <ParticipantPicker users={playerUsers} selectedIds={selectedIds} onChange={setPlayers} />
      </div>

      {roster.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label>Assign characters</Label>
            <span className="text-2xs text-fg-muted">
              <span className="text-emerald-300">Good {goodCount}</span>
              <span className="px-1 text-fg-disabled">·</span>
              <span className="text-rose-300">Evil {evilCount}</span>
              {unassignedCount > 0 && (
                <>
                  <span className="px-1 text-fg-disabled">·</span>
                  <span className="text-amber-300">{unassignedCount} unassigned</span>
                </>
              )}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {roster.map((slot) => (
              <CharacterRow
                key={slot.userId}
                slot={slot}
                groups={groups}
                onRoleChange={(role) => setRole(slot.userId, role)}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <Label>Winner</Label>
        <div className="flex gap-2">
          <WinnerButton
            active={winnerSide === "good"}
            tone="good"
            onClick={() => setWinner("good")}
          >
            Good won
          </WinnerButton>
          <WinnerButton
            active={winnerSide === "evil"}
            tone="evil"
            onClick={() => setWinner("evil")}
          >
            Evil won
          </WinnerButton>
        </div>
      </div>
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────

function StorytellerPicker({
  users,
  moderator,
  onChangeStoryteller,
  onChangeFabled,
}: {
  users: User[];
  moderator: MatchOutcomeTeams["moderator"];
  onChangeStoryteller: (user: User | null) => void;
  onChangeFabled: (fabled: string | undefined) => void;
}) {
  const groups = fabledByGroup();
  return (
    <div>
      <Label>Storyteller</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          compact
          block={false}
          value={moderator?.userId ?? ""}
          onChange={(e) => {
            const next = users.find((u) => u.id === e.target.value);
            onChangeStoryteller(next ?? null);
          }}
        >
          <option value="">— none —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        {moderator && (
          <>
            <Select
              compact
              block={false}
              value={moderator.role ?? ""}
              onChange={(e) => onChangeFabled(e.target.value || undefined)}
            >
              <option value="">No Fabled</option>
              {groups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.names.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
            <span className="text-3xs uppercase tracking-wider text-fg-muted">
              Runs the game · not a team
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function EditionPicker({
  edition,
  onChange,
}: {
  edition: ClocktowerEdition;
  onChange: (next: ClocktowerEdition) => void;
}) {
  return (
    <div>
      <Label>Edition</Label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {CLOCKTOWER_EDITIONS.map((opt) => (
          <Chip
            key={opt.id}
            pressed={edition === opt.id}
            tone="accent"
            size="sm"
            block
            onClick={() => onChange(opt.id)}
          >
            {opt.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function CharacterRow({
  slot,
  groups,
  onRoleChange,
}: {
  slot: Slot;
  groups: ReadonlyArray<{ label: string; names: ReadonlyArray<string> }>;
  onRoleChange: (role: string | undefined) => void;
}) {
  const id = useId();
  const character = findClocktowerCharacter(slot.role);
  const align = character ? clocktowerAlignment(character.category) : null;
  return (
    <PlayerRow
      name={slot.displayName}
      right={
        <>
          <AlignmentBadge align={align} />
          <Select
            compact
            block={false}
            className="w-44"
            id={id}
            value={slot.role ?? ""}
            onChange={(e) => onRoleChange(e.target.value || undefined)}
          >
            <option value="">— pick character —</option>
            {groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.names.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </>
      }
    />
  );
}

function AlignmentBadge({ align }: { align: "good" | "evil" | null }) {
  if (!align) {
    return (
      <span className="rounded px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wide text-fg-disabled">
        —
      </span>
    );
  }
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wide ${
        align === "good" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
      }`}
    >
      {align}
    </span>
  );
}

function WinnerButton({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone: "good" | "evil";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Chip
      pressed={active}
      tone={tone === "good" ? "emerald" : "rose"}
      size="md"
      block
      onClick={onClick}
      className="flex-1"
    >
      {children}
    </Chip>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-secondary">
      {children}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

const GOOD_INDEX = 0;
const EVIL_INDEX = 1;

function alignmentOf(role: string | undefined): "good" | "evil" | null {
  const c = findClocktowerCharacter(role);
  return c ? clocktowerAlignment(c.category) : null;
}

function flattenRoster(value: MatchOutcomeTeams): Slot[] {
  const flat: Slot[] = [];
  for (const team of value.teams) {
    for (const m of team.members) {
      flat.push({ userId: m.userId, displayName: m.displayName, role: m.role });
    }
  }
  flat.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return flat;
}

function projectToOutcome(
  roster: Slot[],
  winnerTeamIndices: number[],
  moderator: MatchOutcomeTeams["moderator"],
): MatchOutcomeTeams {
  const good: MatchOutcomeTeams["teams"][number]["members"] = [];
  const evil: MatchOutcomeTeams["teams"][number]["members"] = [];
  for (const s of roster) {
    const character = findClocktowerCharacter(s.role);
    const bucket = character && clocktowerAlignment(character.category) === "evil" ? evil : good;
    bucket.push(
      s.role
        ? { userId: s.userId, displayName: s.displayName, role: s.role }
        : { userId: s.userId, displayName: s.displayName },
    );
  }
  return {
    kind: "teams",
    teams: [{ members: good }, { members: evil }],
    winnerTeamIndices,
    ...(moderator ? { moderator } : {}),
  };
}
