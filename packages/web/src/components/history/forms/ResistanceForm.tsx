import type { MatchOutcomeTeams, Participant } from "@boardgames/core/history/types";
import { Chip } from "../../ui/Chip";
import { ParticipantPicker } from "../ParticipantPicker";
import { PlayerRow } from "../PlayerRow";

type User = { id: string; name: string };
type Side = "resistance" | "spy";
type Slot = { userId: string; displayName: string; side: Side };

type Props = {
  users: User[];
  value: MatchOutcomeTeams;
  onChange: (next: MatchOutcomeTeams) => void;
};

const RESISTANCE_INDEX = 0;
const SPY_INDEX = 1;

/**
 * Match-history form for The Resistance. Mirrors the Blood on the Clocktower
 * good-vs-evil shape: players split between the Resistance Operatives (team 0,
 * "good" / green) and the Spies (team 1, "evil" / red), with exactly one
 * winning side. The base game has no per-player characters, so there's no role
 * picker — the edition (Standard / The Plot Thickens) is chosen in the shared
 * variant picker above the form and rides along in `outcome.scenario`, which
 * this form preserves on every change.
 */
export function ResistanceForm({ users, value, onChange }: Props) {
  // Flatten the two teams into one roster, stabilized by display name so a row
  // doesn't jump as the admin flips someone between Resistance and Spy.
  const roster = flattenRoster(value);
  const selectedIds = roster.map((s) => s.userId);

  const winnerSide: Side | null =
    value.winnerTeamIndices.length === 0
      ? null
      : value.winnerTeamIndices.includes(RESISTANCE_INDEX)
        ? "resistance"
        : "spy";

  function commit(next: Slot[], winnerTeamIndices = value.winnerTeamIndices) {
    onChange(projectToOutcome(next, winnerTeamIndices, value.scenario));
  }

  function setPlayers(participants: Participant[]) {
    const sideById = new Map(roster.map((s) => [s.userId, s.side] as const));
    const next: Slot[] = participants.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      // New players default to the Resistance — the Spies are always the
      // minority, so this minimizes clicks.
      side: sideById.get(p.userId) ?? "resistance",
    }));
    commit(next);
  }

  function setSide(userId: string, side: Side) {
    commit(roster.map((s) => (s.userId === userId ? { ...s, side } : s)));
  }

  function setWinner(side: Side) {
    onChange({
      ...value,
      winnerTeamIndices: [side === "resistance" ? RESISTANCE_INDEX : SPY_INDEX],
    });
  }

  const resistanceCount = roster.filter((s) => s.side === "resistance").length;
  const spyCount = roster.filter((s) => s.side === "spy").length;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label>Players</Label>
        <ParticipantPicker users={users} selectedIds={selectedIds} onChange={setPlayers} />
      </div>

      {roster.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label>Assign sides</Label>
            <span className="text-2xs text-fg-muted">
              <span className="text-emerald-300">Resistance {resistanceCount}</span>
              <span className="px-1 text-fg-disabled">·</span>
              <span className="text-rose-300">Spies {spyCount}</span>
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {roster.map((slot) => (
              <SideRow
                key={slot.userId}
                slot={slot}
                onSide={(side) => setSide(slot.userId, side)}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <Label>Winner</Label>
        <div className="flex gap-2">
          <WinnerButton
            active={winnerSide === "resistance"}
            tone="emerald"
            onClick={() => setWinner("resistance")}
          >
            Resistance won
          </WinnerButton>
          <WinnerButton active={winnerSide === "spy"} tone="rose" onClick={() => setWinner("spy")}>
            Spies won
          </WinnerButton>
        </div>
      </div>
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────

function SideRow({ slot, onSide }: { slot: Slot; onSide: (side: Side) => void }) {
  return (
    <PlayerRow
      name={slot.displayName}
      right={
        <div className="flex gap-1">
          <Chip
            pressed={slot.side === "resistance"}
            tone="emerald"
            size="xs"
            onClick={() => onSide("resistance")}
          >
            Resistance
          </Chip>
          <Chip pressed={slot.side === "spy"} tone="rose" size="xs" onClick={() => onSide("spy")}>
            Spy
          </Chip>
        </div>
      }
    />
  );
}

function WinnerButton({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone: "emerald" | "rose";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Chip pressed={active} tone={tone} size="md" block onClick={onClick} className="flex-1">
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

function flattenRoster(value: MatchOutcomeTeams): Slot[] {
  const flat: Slot[] = [];
  value.teams.forEach((team, i) => {
    const side: Side = i === SPY_INDEX ? "spy" : "resistance";
    for (const m of team.members) {
      flat.push({ userId: m.userId, displayName: m.displayName, side });
    }
  });
  flat.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return flat;
}

function projectToOutcome(
  roster: Slot[],
  winnerTeamIndices: number[],
  scenario: string | undefined,
): MatchOutcomeTeams {
  const resistance: MatchOutcomeTeams["teams"][number]["members"] = [];
  const spies: MatchOutcomeTeams["teams"][number]["members"] = [];
  for (const s of roster) {
    (s.side === "spy" ? spies : resistance).push({
      userId: s.userId,
      displayName: s.displayName,
    });
  }
  return {
    kind: "teams",
    teams: [{ members: resistance }, { members: spies }],
    winnerTeamIndices,
    ...(scenario ? { scenario } : {}),
  };
}
