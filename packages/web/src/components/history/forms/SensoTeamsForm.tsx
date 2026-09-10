import type { MatchOutcomeTeams, Participant } from "@boardgames/core/history/types";
import { useEffect } from "react";
import { Input } from "../../ui/Input";
import { Surface } from "../../ui/Surface";
import { ParticipantPicker } from "../ParticipantPicker";
import { PlayerRow } from "../PlayerRow";
import { ResultLine } from "./SensoForm";
import {
  CLAN_FACTIONS,
  normalizeSensoTeams,
  SENSO_TEAM_SIZE,
  sensoScoresEntered,
  sensoTeamsEqual,
  sensoTeamsStandings,
} from "./senso-standings";
import { GroupLabel, OutcomeFormShell, RoleChipRow, withOptional } from "./shared";

// Sensō 2v2: two fixed pairs, each seat tagged with its clan (no Emperor in
// a four-player game). Each team's points are entered as one total; a tie
// opens the pair's combined cube count; a tie that survives that is shared.
// The winning side is derived by `senso-standings.ts`, never toggled.

type User = { id: string; name: string };
type Team = MatchOutcomeTeams["teams"][number];
type Member = Team["members"][number];

type Props = {
  users: User[];
  value: MatchOutcomeTeams;
  onChange: (next: MatchOutcomeTeams) => void;
};

export function SensoTeamsForm({ users, value, onChange }: Props) {
  useEffect(() => {
    const normalized = normalizeSensoTeams(value);
    if (!sensoTeamsEqual(value, normalized)) onChange(normalized);
  }, [value, onChange]);

  function commit(teams: Team[]) {
    onChange(normalizeSensoTeams({ ...value, teams }));
  }

  function updateTeam(idx: number, patch: Partial<Team>) {
    commit(value.teams.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }

  function setMembers(idx: number, participants: Participant[]) {
    // Picking a player already seated on the other pair MOVES them here —
    // their clan travels with them.
    const pickedIds = new Set(participants.map((p) => p.userId));
    const memberByUserId = new Map(
      value.teams.flatMap((t) => t.members.map((m) => [m.userId, m] as const)),
    );
    commit(
      value.teams.map((t, i) => {
        if (i !== idx) return { ...t, members: t.members.filter((m) => !pickedIds.has(m.userId)) };
        const members: Member[] = participants.map((p) => {
          const prev = memberByUserId.get(p.userId);
          return prev ? { ...prev, ...p } : p;
        });
        return { ...t, members };
      }),
    );
  }

  function setFaction(teamIdx: number, userId: string, faction: string) {
    const team = value.teams[teamIdx];
    if (!team) return;
    updateTeam(teamIdx, {
      members: team.members.map((m) =>
        m.userId === userId ? withOptional(m, "role", m.role === faction ? undefined : faction) : m,
      ),
    });
  }

  function parseCount(raw: string): number {
    const num = Number.parseFloat(raw);
    return Number.isFinite(num) ? num : 0;
  }

  const entered = sensoScoresEntered(value.teams);
  const [a, b] = value.teams;
  const tie = entered && a !== undefined && b !== undefined && (a.score ?? 0) === (b.score ?? 0);
  const standings = entered ? sensoTeamsStandings(value.teams) : null;

  return (
    <OutcomeFormShell>
      <GroupLabel>
        Two pairs of clans. Enter each team's points; a tie goes to the pair's combined cubes on the
        map.
      </GroupLabel>
      <div className="flex flex-col gap-3">
        {value.teams.map((team, idx) => {
          const isWinner = value.winnerTeamIndices.includes(idx);
          return (
            <Surface
              as="div"
              // biome-ignore lint/suspicious/noArrayIndexKey: the two pairs are positional and never reorder.
              key={idx}
              variant="panel"
              padding="md"
              className="flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <GroupLabel>Team {idx + 1}</GroupLabel>
                <span className="flex-1" />
                <Input
                  type="number"
                  inputMode="numeric"
                  aria-label={`Team ${idx + 1} — points`}
                  value={team.score ?? 0}
                  onChange={(e) => updateTeam(idx, { score: parseCount(e.target.value) })}
                  width="score"
                />
              </div>
              <ParticipantPicker
                users={users}
                selectedIds={team.members.map((m) => m.userId)}
                onChange={(participants) => setMembers(idx, participants)}
                max={SENSO_TEAM_SIZE}
              />
              {team.members.length > 0 && (
                <div className="flex flex-col gap-1.5 pt-1">
                  {team.members.map((m) => (
                    <div key={m.userId} className="flex flex-col gap-1">
                      <PlayerRow name={m.displayName} highlight={isWinner} />
                      <RoleChipRow
                        roster={CLAN_FACTIONS}
                        current={m.role}
                        onToggle={(faction) => setFaction(idx, m.userId, faction)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Surface>
          );
        })}
      </div>

      {tie && (
        <div className="flex flex-col gap-2 rounded-card-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-amber-200">
              Tied at {a?.score ?? 0} points
            </span>
            <span className="text-2xs leading-snug text-fg-secondary">
              Count each pair's cubes on the map together — the most cubes wins. Still tied, the
              game is shared.
            </span>
          </div>
          {value.teams.map((team, idx) => (
            <PlayerRow
              // biome-ignore lint/suspicious/noArrayIndexKey: positional pairs.
              key={idx}
              name={`Team ${idx + 1}`}
              highlight={standings?.winners.includes(idx) ?? false}
              right={
                <Input
                  type="number"
                  inputMode="numeric"
                  aria-label={`Team ${idx + 1} — cubes on the map`}
                  value={team.tiebreak ?? ""}
                  placeholder="cubes"
                  onChange={(e) =>
                    updateTeam(idx, {
                      tiebreak: Math.min(1000, Math.max(0, Math.trunc(parseCount(e.target.value)))),
                    })
                  }
                  width="auto"
                  className="w-20 px-2 text-right tabular-nums"
                />
              }
            />
          ))}
        </div>
      )}

      {standings && (
        <ResultLine
          standings={standings}
          names={value.teams.map((t, i) =>
            t.members.length > 0
              ? t.members.map((m) => m.displayName.split(" ")[0]).join(" & ")
              : `Team ${i + 1}`,
          )}
        />
      )}
    </OutcomeFormShell>
  );
}
