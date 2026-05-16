import type { MatchOutcomeTeams, Participant } from "@boardgames/core/history/types";
import { teamConfigForSlug } from "../../../games/team-config";
import { Input } from "../../ui/Input";
import { ParticipantPicker } from "../ParticipantPicker";

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
    // Make sure the same player isn't on two teams.
    const otherTeamIds = new Set<string>();
    for (let i = 0; i < value.teams.length; i++) {
      if (i === idx) continue;
      for (const m of value.teams[i].members) otherTeamIds.add(m.userId);
    }
    const filtered = participants.filter((p) => !otherTeamIds.has(p.userId));
    // Carry over existing roles for members that survive the picker change.
    const roleByUserId = new Map(value.teams[idx].members.map((m) => [m.userId, m.role] as const));
    const members: TeamMember[] = filtered.map((p) => {
      const role = roleByUserId.get(p.userId);
      return role !== undefined ? { ...p, role } : p;
    });
    updateTeam(idx, { members });
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
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: teams have no stable id; reorders aren't supported.
              key={idx}
              className="flex flex-col gap-2 rounded-lg border border-white/10 bg-surface-900/60 p-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
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
                    className="!w-24 text-right"
                  />
                )}
                {showManualWinner ? (
                  <button
                    type="button"
                    onClick={() => toggleWinner(idx)}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                      isWinner
                        ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40"
                        : "bg-surface-800 text-gray-400 hover:bg-surface-700"
                    }`}
                  >
                    Winner
                  </button>
                ) : (
                  isWinner && (
                    <span
                      className="rounded-md bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-200 ring-1 ring-amber-400/30"
                      title="Auto-detected from the highest score"
                    >
                      Leading
                    </span>
                  )
                )}
                {value.teams.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeTeam(idx)}
                    className="rounded-md px-2 py-1 text-xs text-rose-400 hover:bg-rose-500/10"
                  >
                    ✕
                  </button>
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
                      onRoleChange={(role) => setMemberRole(idx, m.userId, role)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={addTeam}
        disabled={value.teams.length >= 8}
        className="self-start rounded-md border border-white/10 px-3 py-1.5 text-xs text-gray-300 hover:bg-surface-800 disabled:opacity-50"
      >
        + Add team
      </button>
    </div>
  );
}

// Rendered only when the game config defines `memberRoles` — games without
// named seats (Wavelength, Resistance, etc.) don't render this row at all.
function MemberRoleRow({
  member,
  roleOptions,
  onRoleChange,
}: {
  member: TeamMember;
  roleOptions: string[];
  onRoleChange: (role: string | undefined) => void;
}) {
  const role = member.role ?? "";
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 truncate text-sm text-gray-200">{member.displayName}</span>
      <div className="flex flex-wrap gap-1">
        {roleOptions.map((opt) => {
          const active = role === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onRoleChange(active ? undefined : opt)}
              className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                active
                  ? "bg-accent-500/20 text-accent-100 ring-1 ring-accent-400/40"
                  : "bg-surface-800 text-gray-400 hover:bg-surface-700"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
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
