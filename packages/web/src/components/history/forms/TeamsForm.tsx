import type { MatchOutcomeTeams, Participant } from "@boardgames/core/history/types";
import {
  allowsMultipleRoles,
  joinMemberRoles,
  splitMemberRoles,
  teamConfigForSlug,
} from "../../../games/team-config";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { IconButton } from "../../ui/IconButton";
import { Input } from "../../ui/Input";
import { Surface } from "../../ui/Surface";
import { ParticipantPicker } from "../ParticipantPicker";
import { PlayerRow } from "../PlayerRow";

type User = { id: string; name: string };
type TeamMember = MatchOutcomeTeams["teams"][number]["members"][number];

type Props = {
  users: User[];
  value: MatchOutcomeTeams;
  onChange: (next: MatchOutcomeTeams) => void;
  /** Used to look up per-game team config (scores on/off, role chips). */
  gameSlug: string | null;
};

export function TeamsForm({ users, value, onChange, gameSlug }: Props) {
  const config = teamConfigForSlug(gameSlug);
  const showScores = config.hasScores === true;
  const memberRoles = config.memberRoles ?? [];
  const leadRole = config.leadRole;
  const autoWinner = config.autoWinner;
  const showRoles = memberRoles.length > 0;
  const showManualWinner = !autoWinner;

  /**
   * Single mutation entry point. When `autoWinner` is configured, we
   * recompute `winnerTeamIndices` from the scores on every change so the
   * admin never has to flip a Winner toggle by hand — same UX as
   * free-for-all's implicit winner.
   */
  function commit(next: MatchOutcomeTeams): void {
    if (!autoWinner) {
      onChange(next);
      return;
    }
    onChange({ ...next, winnerTeamIndices: computeAutoWinner(next.teams, autoWinner) });
  }

  function updateTeam(idx: number, patch: Partial<MatchOutcomeTeams["teams"][number]>) {
    const teams = value.teams.map((t, i) => (i === idx ? { ...t, ...patch } : t));
    commit({ ...value, teams });
  }

  function setMembers(idx: number, participants: Participant[]) {
    // Selecting a player who already sits on another team MOVES them here —
    // their chip on the other team un-presses instead of the click being
    // swallowed. Roles (and elimination marks) travel with the player.
    const pickedIds = new Set(participants.map((p) => p.userId));
    const memberByUserId = new Map(
      value.teams.flatMap((t) => t.members.map((m) => [m.userId, m] as const)),
    );
    const teams = value.teams.map((t, i) => {
      if (i !== idx) return { ...t, members: t.members.filter((m) => !pickedIds.has(m.userId)) };
      const members: TeamMember[] = participants.map((p) => {
        const prev = memberByUserId.get(p.userId);
        return prev ? { ...prev, ...p } : p;
      });
      return { ...t, members };
    });
    commit({ ...value, teams });
  }

  function setMemberRole(teamIdx: number, userId: string, role: string | undefined) {
    const team = value.teams[teamIdx];
    const trimmed = role?.trim();
    const newRole = trimmed && trimmed.length > 0 ? trimmed : undefined;
    // Codenames-style: assigning the lead role (Spymaster) implies the rest of
    // the team is in the fallback seat (Operative). This matches how the game
    // is actually played and saves several extra clicks.
    const fillFallback = leadRole && newRole === leadRole.primary;
    const members: TeamMember[] = team.members.map((m) => {
      if (m.userId === userId) {
        return newRole
          ? { userId: m.userId, displayName: m.displayName, role: newRole }
          : { userId: m.userId, displayName: m.displayName };
      }
      if (fillFallback) {
        return { userId: m.userId, displayName: m.displayName, role: leadRole.fallback };
      }
      return m;
    });
    updateTeam(teamIdx, { members });
  }

  function addTeam() {
    commit({ ...value, teams: [...value.teams, { members: [] }] });
  }

  function removeTeam(idx: number) {
    if (value.teams.length <= 2) return;
    const teams = value.teams.filter((_, i) => i !== idx);
    const winnerTeamIndices = value.winnerTeamIndices
      .filter((i) => i !== idx)
      .map((i) => (i > idx ? i - 1 : i));
    commit({ ...value, teams, winnerTeamIndices });
  }

  function toggleWinner(idx: number) {
    const set = new Set(value.winnerTeamIndices);
    if (set.has(idx)) set.delete(idx);
    else set.add(idx);
    onChange({ ...value, winnerTeamIndices: [...set] });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3">
        {value.teams.map((team, idx) => {
          const isWinner = value.winnerTeamIndices.includes(idx);
          return (
            <Surface
              as="div"
              // biome-ignore lint/suspicious/noArrayIndexKey: teams have no stable id; reorders aren't supported.
              key={idx}
              variant="panel"
              padding="md"
              className="flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-fg-secondary">
                  Team {idx + 1}
                </span>
                <span className="flex-1" />
                {showScores && (
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={team.score ?? 0}
                    onChange={(e) => {
                      const num = Number.parseFloat(e.target.value);
                      updateTeam(idx, { score: Number.isFinite(num) ? num : 0 });
                    }}
                    width="score"
                  />
                )}
                {showManualWinner ? (
                  <Chip pressed={isWinner} tone="amber" size="sm" onClick={() => toggleWinner(idx)}>
                    Winner
                  </Chip>
                ) : (
                  isWinner && (
                    <Chip
                      pressed
                      tone="amber"
                      size="sm"
                      asStatic
                      title="Auto-detected from the highest score"
                    >
                      Leading
                    </Chip>
                  )
                )}
                {value.teams.length > 2 && (
                  <IconButton
                    variant="danger"
                    size="xs"
                    aria-label={`Remove team ${idx + 1}`}
                    onClick={() => removeTeam(idx)}
                    icon={<span aria-hidden="true">✕</span>}
                  />
                )}
              </div>
              <ParticipantPicker
                users={users}
                selectedIds={team.members.map((m) => m.userId)}
                onChange={(participants) => setMembers(idx, participants)}
              />
              {showRoles && team.members.length > 0 && (
                <div className="flex flex-col gap-1.5 pt-1">
                  {team.members.map((m) => (
                    <MemberRoleRow
                      key={m.userId}
                      member={m}
                      roleOptions={memberRoles}
                      multi={allowsMultipleRoles(config, team.members.length)}
                      onRoleChange={(role) => setMemberRole(idx, m.userId, role)}
                    />
                  ))}
                </div>
              )}
            </Surface>
          );
        })}
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={addTeam}
        disabled={value.teams.length >= 8}
        className="self-start"
      >
        + Add team
      </Button>
    </div>
  );
}

// Rendered only when the game config defines `memberRoles` — games without
// named seats (Wavelength, Resistance, etc.) don't render this row at all.
// `multi` (undermanned team, e.g. a 2-player Captain Sonar sub) lets one
// member hold several seats; the seats are stored joined in the same `role`
// string.
function MemberRoleRow({
  member,
  roleOptions,
  multi,
  onRoleChange,
}: {
  member: TeamMember;
  roleOptions: string[];
  multi: boolean;
  onRoleChange: (role: string | undefined) => void;
}) {
  const selected = splitMemberRoles(member.role);
  function toggle(opt: string, active: boolean) {
    if (!multi) {
      onRoleChange(active ? undefined : opt);
      return;
    }
    const next = active ? selected.filter((r) => r !== opt) : [...selected, opt];
    onRoleChange(joinMemberRoles(next, roleOptions));
  }
  return (
    <PlayerRow
      name={member.displayName}
      right={
        <div className="flex flex-wrap gap-1">
          {roleOptions.map((opt) => {
            const active = multi ? selected.includes(opt) : member.role === opt;
            return (
              <Chip
                key={opt}
                pressed={active}
                tone="accent"
                size="xs"
                onClick={() => toggle(opt, active)}
              >
                {opt}
              </Chip>
            );
          })}
        </div>
      }
    />
  );
}

/**
 * Pick the indices of the teams that lead on score. Ties intentionally produce
 * multiple winners — Wavelength can absolutely end 10/10 on a final guess and
 * the schema allows multi-winner team rows.
 */
function computeAutoWinner(
  teams: MatchOutcomeTeams["teams"],
  mode: "highest" | "lowest",
): number[] {
  const scores = teams.map((t) => t.score ?? 0);
  if (scores.length === 0) return [];
  const target = mode === "highest" ? Math.max(...scores) : Math.min(...scores);
  return scores.flatMap((s, i) => (s === target ? [i] : []));
}
