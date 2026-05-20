import type { MatchOutcomeTeams, Participant } from "@boardgames/core/history/types";
import { useMemo, useState } from "react";
import {
  computeWerewolfWinners,
  findScenario,
  poolSize,
  SCENARIOS,
  type Scenario,
  type ScenarioId,
  WEREWOLF_ROLES,
  type WerewolfTeam,
} from "../../../games/one-night-ultimate-werewolf/roles";
import { ParticipantPicker } from "../ParticipantPicker";

type User = { id: string; name: string };

type Props = {
  users: User[];
  value: MatchOutcomeTeams;
  onChange: (next: MatchOutcomeTeams) => void;
};

type Slot = {
  userId: string;
  displayName: string;
  team: WerewolfTeam;
  eliminated: boolean;
};

const TEAM_ORDER: readonly WerewolfTeam[] = ["village", "werewolf", "tanner"];

/**
 * Match-history form for One Night Ultimate Werewolf. Cards swap so much that
 * tracking per-player *roles* is noise; what matters for win-state is which
 * **team** each player ended up on plus who got voted out. The scenario picker
 * + pool counts stay around purely as a record of what cards were potentially
 * in play that night.
 */
export function WerewolfForm({ users, value, onChange }: Props) {
  const roster = flattenRoster(value);
  const selectedIds = roster.map((s) => s.userId);

  // Seed the scenario picker from a previously-saved record so edit mode
  // doesn't lose the choice — we match by display label since that's what
  // ships on the wire.
  const initialScenarioId = SCENARIOS.find((s) => s.label === value.scenario)?.id ?? "custom";
  const [scenarioId, setScenarioId] = useState<ScenarioId>(initialScenarioId);
  const scenario = findScenario(scenarioId);
  const [customPool, setCustomPool] = useState<Record<string, number>>({});

  const pool = useMemo(() => {
    if (scenarioId === "custom" || !scenario) return customPool;
    return scenario.pool(clampPlayers(roster.length || scenario.players[0], scenario));
  }, [scenarioId, scenario, customPool, roster.length]);

  // Tanner / Werewolf team buttons stay disabled while the pool can't support
  // those teams — you shouldn't be able to put someone on a team whose card
  // wasn't dealt. A currently-selected team stays clickable so the user can
  // always undo a stale assignment after editing the pool.
  const tannerInPool = (pool.tanner ?? 0) > 0;
  const werewolfInPool = (pool.werewolf ?? 0) + (pool.minion ?? 0) > 0;

  // Resolves to the scenario label that should be persisted, or null when
  // we're in Custom mode (no scenario to remember).
  function scenarioLabel(id: ScenarioId): string | null {
    if (id === "custom") return null;
    return findScenario(id)?.label ?? null;
  }

  function commit(next: Slot[], nextScenarioId: ScenarioId = scenarioId) {
    // Winner computation works role-agnostically: use synthetic role ids so
    // the existing helper can be reused (`werewolf` = werewolf team,
    // `tanner` = tanner, anything else falls into village).
    const winners = computeWerewolfWinners(
      next.map((s) => ({
        roleId: s.team === "werewolf" ? "werewolf" : s.team === "tanner" ? "tanner" : "villager",
        eliminated: s.eliminated,
      })),
    );
    onChange(projectToOutcome(next, winners, scenarioLabel(nextScenarioId)));
  }

  function setPlayers(participants: Participant[]) {
    const prevById = new Map(roster.map((s) => [s.userId, s] as const));
    const next: Slot[] = participants.map((p) => {
      const prev = prevById.get(p.userId);
      return {
        userId: p.userId,
        displayName: p.displayName,
        team: prev?.team ?? "village",
        eliminated: prev?.eliminated ?? false,
      };
    });
    commit(next);
  }

  function setTeam(userId: string, team: WerewolfTeam) {
    const next = roster.map((s) => (s.userId === userId ? { ...s, team } : s));
    commit(next);
  }

  function setEliminated(userId: string, eliminated: boolean) {
    const next = roster.map((s) => (s.userId === userId ? { ...s, eliminated } : s));
    commit(next);
  }

  function pickScenario(id: ScenarioId) {
    setScenarioId(id);
    // Persist the label change immediately, even before the roster is set, so
    // the saved record always knows which scenario was played.
    commit(roster, id);
    if (id === "custom") return;
    const sc = findScenario(id);
    if (!sc) return;
    setCustomPool(sc.pool(clampPlayers(roster.length || sc.players[0], sc)));
  }

  function adjustPoolCount(roleId: string, delta: number) {
    const role = WEREWOLF_ROLES.find((r) => r.id === roleId);
    if (!role) return;
    const next = { ...pool };
    const target = Math.max(0, Math.min(role.max, (next[roleId] ?? 0) + delta));
    if (target === 0) delete next[roleId];
    else next[roleId] = target;
    setCustomPool(next);
    setScenarioId("custom");
    commit(roster, "custom");
  }

  const totalPool = poolSize(pool);
  const expectedPool = roster.length + 3;
  const winners = computeWerewolfWinners(
    roster.map((s) => ({
      roleId: s.team === "werewolf" ? "werewolf" : s.team === "tanner" ? "tanner" : "villager",
      eliminated: s.eliminated,
    })),
  );

  return (
    <div className="flex flex-col gap-3">
      <ScenarioPicker scenarioId={scenarioId} onPick={pickScenario} />

      <PoolEditor pool={pool} onAdjust={adjustPoolCount} />

      {roster.length > 0 && (
        <div className="text-[11px] text-gray-500">
          Card pool: <span className="text-gray-300">{totalPool}</span>
          <span className="px-1 text-gray-700">·</span>
          Expected: <span className="text-gray-300">{expectedPool}</span> (players + 3 at center)
          {totalPool !== expectedPool && (
            <span className="ml-2 text-amber-400">
              ⚠ {totalPool < expectedPool ? "under" : "over"} by{" "}
              {Math.abs(totalPool - expectedPool)}
            </span>
          )}
        </div>
      )}

      <div>
        <Label>Players</Label>
        <ParticipantPicker users={users} selectedIds={selectedIds} onChange={setPlayers} />
      </div>

      {roster.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label>Final teams</Label>
          <div className="flex flex-col gap-1.5">
            {roster.map((slot) => (
              <PlayerRow
                key={slot.userId}
                slot={slot}
                tannerAvailable={tannerInPool}
                werewolfAvailable={werewolfInPool}
                onTeamChange={(team) => setTeam(slot.userId, team)}
              />
            ))}
          </div>
        </div>
      )}

      {roster.length > 0 && (
        <div>
          <Label>Voted out</Label>
          <div className="flex flex-wrap gap-1.5">
            {roster.map((slot) => (
              <VotedOutChip
                key={slot.userId}
                slot={slot}
                onToggle={() => setEliminated(slot.userId, !slot.eliminated)}
              />
            ))}
          </div>
          <p className="mt-1 text-[11px] text-gray-500">
            Click anyone the village killed. Leave blank if nobody died (tie-with-no-kill).
          </p>
        </div>
      )}

      <div>
        <Label>Winners (auto)</Label>
        <div className="flex gap-2">
          <WinnerChip team="village" active={winners.includes("village")} />
          <WinnerChip team="werewolf" active={winners.includes("werewolf")} />
          <WinnerChip
            team="tanner"
            active={winners.includes("tanner")}
            disabled={!roster.some((s) => s.team === "tanner")}
          />
        </div>
        {winners.length === 0 && roster.length > 0 && (
          <p className="mt-1 text-[11px] text-amber-300">
            No winning team — everyone loses (no Werewolves in play but someone got voted out).
          </p>
        )}
      </div>
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────

function ScenarioPicker({
  scenarioId,
  onPick,
}: {
  scenarioId: ScenarioId;
  onPick: (id: ScenarioId) => void;
}) {
  return (
    <div>
      <Label>Scenario</Label>
      <select
        value={scenarioId}
        onChange={(e) => onPick(e.target.value as ScenarioId)}
        className="w-full rounded-md border border-white/10 bg-surface-900 px-2 py-1.5 text-xs text-gray-100"
      >
        <option value="custom">Custom — pick roles manually</option>
        {SCENARIOS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label} ({s.difficulty}, {s.players[0]}–{s.players[s.players.length - 1]} players)
          </option>
        ))}
      </select>
    </div>
  );
}

function PoolEditor({
  pool,
  onAdjust,
}: {
  pool: Record<string, number>;
  onAdjust: (roleId: string, delta: number) => void;
}) {
  return (
    <div>
      <Label>Card pool (informational)</Label>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {WEREWOLF_ROLES.map((role) => {
          const count = pool[role.id] ?? 0;
          return (
            <div
              key={role.id}
              className={`flex items-center justify-between gap-1 rounded-md border px-2 py-1 text-xs ${
                count > 0 ? "border-white/10 bg-surface-900" : "border-white/5 bg-surface-900/40"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <TeamDot team={role.team} />
                <span className={count > 0 ? "text-gray-200" : "text-gray-500"}>{role.label}</span>
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onAdjust(role.id, -1)}
                  disabled={count === 0}
                  className="rounded bg-surface-800 px-1.5 text-gray-300 hover:bg-surface-700 disabled:opacity-30"
                  aria-label={`Remove ${role.label}`}
                >
                  −
                </button>
                <span className="min-w-[1.5em] text-center font-mono text-[11px] text-gray-200">
                  {count}
                </span>
                <button
                  type="button"
                  onClick={() => onAdjust(role.id, 1)}
                  disabled={count >= role.max}
                  className="rounded bg-surface-800 px-1.5 text-gray-300 hover:bg-surface-700 disabled:opacity-30"
                  aria-label={`Add ${role.label}`}
                >
                  +
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlayerRow({
  slot,
  tannerAvailable,
  werewolfAvailable,
  onTeamChange,
}: {
  slot: Slot;
  tannerAvailable: boolean;
  werewolfAvailable: boolean;
  onTeamChange: (team: WerewolfTeam) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 truncate text-sm text-gray-200">{slot.displayName}</span>
      <div className="flex shrink-0 overflow-hidden rounded-md border border-white/10">
        <TeamButton
          team="village"
          active={slot.team === "village"}
          onClick={() => onTeamChange("village")}
        />
        <TeamButton
          team="werewolf"
          active={slot.team === "werewolf"}
          disabled={!werewolfAvailable && slot.team !== "werewolf"}
          onClick={() => onTeamChange("werewolf")}
        />
        <TeamButton
          team="tanner"
          active={slot.team === "tanner"}
          disabled={!tannerAvailable && slot.team !== "tanner"}
          onClick={() => onTeamChange("tanner")}
        />
      </div>
    </div>
  );
}

function VotedOutChip({ slot, onToggle }: { slot: Slot; onToggle: () => void }) {
  const palette = slot.eliminated
    ? "border-rose-400/60 bg-rose-500/20 text-rose-100"
    : "border-white/10 bg-surface-900 text-gray-400 hover:border-white/30 hover:text-gray-200";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={slot.eliminated}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${palette}`}
    >
      <span aria-hidden="true">{slot.eliminated ? "✗" : "+"}</span>
      <span>{slot.displayName}</span>
    </button>
  );
}

function TeamButton({
  team,
  active,
  disabled,
  onClick,
}: {
  team: WerewolfTeam;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const label = team === "village" ? "Village" : team === "werewolf" ? "Wolf" : "Tanner";
  const palette = active
    ? team === "village"
      ? "bg-emerald-500/20 text-emerald-100"
      : team === "werewolf"
        ? "bg-rose-500/20 text-rose-100"
        : "bg-amber-500/20 text-amber-100"
    : "bg-surface-900 text-gray-500 hover:text-gray-300";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-30 ${palette}`}
    >
      {label}
    </button>
  );
}

function WinnerChip({
  team,
  active,
  disabled,
}: {
  team: WerewolfTeam;
  active: boolean;
  disabled?: boolean;
}) {
  const label =
    team === "village" ? "Village won" : team === "werewolf" ? "Werewolves won" : "Tanner won";
  const palette = disabled
    ? "bg-surface-900/50 text-gray-600"
    : active
      ? team === "village"
        ? "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/40"
        : team === "werewolf"
          ? "bg-rose-500/20 text-rose-100 ring-1 ring-rose-400/40"
          : "bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/40"
      : "bg-surface-800 text-gray-500";
  return (
    <span
      className={`flex-1 rounded-md px-3 py-2 text-center text-sm font-medium ${palette}`}
      aria-disabled={disabled}
    >
      {label}
    </span>
  );
}

function TeamDot({ team }: { team: WerewolfTeam }) {
  const color =
    team === "village" ? "bg-emerald-400" : team === "werewolf" ? "bg-rose-400" : "bg-amber-400";
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} aria-hidden="true" />;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
      {children}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function clampPlayers(n: number, sc: Scenario): number {
  const min = sc.players[0];
  const max = sc.players[sc.players.length - 1];
  return Math.max(min, Math.min(max, n));
}

/**
 * Read existing teams back into a flat roster keyed by team index. The wire
 * shape always emits Village (index 0), then Werewolves, then Tanner (only
 * non-empty teams are emitted, so we need a remapping table on write).
 */
function flattenRoster(value: MatchOutcomeTeams): Slot[] {
  const flat: Slot[] = [];
  const labels = readEmittedTeams(value);
  value.teams.forEach((team, idx) => {
    const teamLabel = labels[idx] ?? "village";
    for (const m of team.members) {
      flat.push({
        userId: m.userId,
        displayName: m.displayName,
        team: teamLabel,
        eliminated: m.eliminated === true,
      });
    }
  });
  flat.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return flat;
}

/**
 * The emit order is fixed (village → werewolf → tanner) and we stamp every
 * member's `role` with their team label, so the index → team mapping survives
 * the round trip via the first member of each team.
 */
function readEmittedTeams(value: MatchOutcomeTeams): WerewolfTeam[] {
  return value.teams.map((team) => {
    const tag = (team.members[0]?.role ?? "").toLowerCase();
    if (tag === "tanner") return "tanner";
    if (tag === "werewolf" || tag === "werewolves") return "werewolf";
    return "village";
  });
}

function projectToOutcome(
  roster: Slot[],
  winners: WerewolfTeam[],
  scenario: string | null,
): MatchOutcomeTeams {
  const buckets: Record<WerewolfTeam, MatchOutcomeTeams["teams"][number]["members"]> = {
    village: [],
    werewolf: [],
    tanner: [],
  };
  // Stamp every member with the team label as their `role`. It both gives
  // MatchCard a useful tooltip ("Alice — Werewolf") and is the signal
  // `readEmittedTeams` uses to recover the team identity on the next read,
  // since empty teams are dropped from the wire shape.
  for (const s of roster) {
    const teamLabel =
      s.team === "village" ? "Village" : s.team === "werewolf" ? "Werewolf" : "Tanner";
    buckets[s.team].push({
      userId: s.userId,
      displayName: s.displayName,
      role: teamLabel,
      ...(s.eliminated ? { eliminated: true } : {}),
    });
  }

  const teams: MatchOutcomeTeams["teams"] = [];
  const emittedTeams: WerewolfTeam[] = [];
  for (const t of TEAM_ORDER) {
    if (buckets[t].length === 0) continue;
    teams.push({ members: buckets[t] });
    emittedTeams.push(t);
  }

  const winnerTeamIndices = winners.map((w) => emittedTeams.indexOf(w)).filter((i) => i >= 0);
  return {
    kind: "teams",
    teams,
    winnerTeamIndices,
    ...(scenario ? { scenario } : {}),
  };
}
