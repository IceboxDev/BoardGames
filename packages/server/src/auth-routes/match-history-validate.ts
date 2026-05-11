import type {
  MatchOutcome,
  MatchOutcomeCoop,
  MatchOutcomeFreeForAll,
  MatchOutcomeLastStanding,
  MatchOutcomeOneVsMany,
  MatchOutcomeTeams,
  Participant,
} from "@boardgames/core/history/types";

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asTrimmedString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length === 0 || t.length > max) return null;
  return t;
}

function asOptionalString(v: unknown, max: number): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") return undefined;
  return v.length > max ? v.slice(0, max) : v;
}

function asFiniteNumber(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

function asInteger(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isInteger(v)) return null;
  return v;
}

function parseParticipant(v: unknown, ctx: string): ParseResult<Participant> {
  if (!isPlainObject(v)) return { ok: false, error: `${ctx}: not an object` };
  const userId = asTrimmedString(v.userId, 100);
  if (!userId) return { ok: false, error: `${ctx}: missing userId` };
  const displayName = asTrimmedString(v.displayName, 200);
  if (!displayName) return { ok: false, error: `${ctx}: missing displayName` };
  return { ok: true, value: { userId, displayName } };
}

function parseFreeForAll(v: Record<string, unknown>): ParseResult<MatchOutcomeFreeForAll> {
  if (!Array.isArray(v.players) || v.players.length < 2) {
    return { ok: false, error: "free-for-all needs >=2 players" };
  }
  if (v.players.length > 20) {
    return { ok: false, error: "free-for-all: too many players (max 20)" };
  }
  const players: MatchOutcomeFreeForAll["players"] = [];
  for (let i = 0; i < v.players.length; i++) {
    const raw = v.players[i];
    const p = parseParticipant(raw, `players[${i}]`);
    if (!p.ok) return p;
    if (!isPlainObject(raw)) return { ok: false, error: `players[${i}]: not an object` };
    const score = asFiniteNumber(raw.score);
    if (score === null) return { ok: false, error: `players[${i}]: invalid score` };
    const rank = raw.rank === undefined ? undefined : asInteger(raw.rank);
    if (rank === null) return { ok: false, error: `players[${i}]: invalid rank` };
    players.push({ ...p.value, score, ...(rank !== undefined ? { rank } : {}) });
  }
  // No explicit winnerUserIds — the player(s) with the highest score are
  // implicit co-winners.
  return {
    ok: true,
    value: {
      kind: "free-for-all",
      players,
    },
  };
}

function parseTeams(v: Record<string, unknown>): ParseResult<MatchOutcomeTeams> {
  if (!Array.isArray(v.teams) || v.teams.length < 2) {
    return { ok: false, error: "teams: need >=2 teams" };
  }
  if (v.teams.length > 8) return { ok: false, error: "teams: too many teams (max 8)" };
  const teams: MatchOutcomeTeams["teams"] = [];
  for (let i = 0; i < v.teams.length; i++) {
    const t = v.teams[i];
    if (!isPlainObject(t)) return { ok: false, error: `teams[${i}]: not an object` };
    if (!Array.isArray(t.members) || t.members.length === 0) {
      return { ok: false, error: `teams[${i}]: empty members` };
    }
    const members: MatchOutcomeTeams["teams"][number]["members"] = [];
    for (let j = 0; j < t.members.length; j++) {
      const raw = t.members[j];
      const p = parseParticipant(raw, `teams[${i}].members[${j}]`);
      if (!p.ok) return p;
      const role =
        isPlainObject(raw) && raw.role !== undefined ? asOptionalString(raw.role, 64) : undefined;
      members.push({ ...p.value, ...(role !== undefined ? { role } : {}) });
    }
    let score: number | undefined;
    if (t.score !== undefined && t.score !== null) {
      const n = asFiniteNumber(t.score);
      if (n === null) return { ok: false, error: `teams[${i}]: invalid score` };
      score = n;
    }
    const rank = t.rank === undefined ? undefined : asInteger(t.rank);
    if (rank === null) return { ok: false, error: `teams[${i}]: invalid rank` };
    teams.push({
      members,
      ...(score !== undefined ? { score } : {}),
      ...(rank !== undefined ? { rank } : {}),
    });
  }
  if (!Array.isArray(v.winnerTeamIndices) || v.winnerTeamIndices.length === 0) {
    return { ok: false, error: "teams: winnerTeamIndices must be non-empty" };
  }
  const winnerTeamIndices: number[] = [];
  for (const idx of v.winnerTeamIndices) {
    if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0 || idx >= teams.length) {
      return { ok: false, error: `winnerTeamIndices: ${idx} out of range` };
    }
    winnerTeamIndices.push(idx);
  }
  return {
    ok: true,
    value: {
      kind: "teams",
      teams,
      winnerTeamIndices,
    },
  };
}

function parseLastStanding(v: Record<string, unknown>): ParseResult<MatchOutcomeLastStanding> {
  if (!Array.isArray(v.players) || v.players.length < 2) {
    return { ok: false, error: "last-standing: need >=2 players" };
  }
  if (v.players.length > 20) return { ok: false, error: "last-standing: too many players" };
  const players: MatchOutcomeLastStanding["players"] = [];
  for (let i = 0; i < v.players.length; i++) {
    const raw = v.players[i];
    const p = parseParticipant(raw, `players[${i}]`);
    if (!p.ok) return p;
    if (!isPlainObject(raw)) return { ok: false, error: `players[${i}]: not an object` };
    const elim = raw.eliminationOrder === undefined ? undefined : asInteger(raw.eliminationOrder);
    if (elim === null) return { ok: false, error: `players[${i}]: invalid eliminationOrder` };
    players.push({
      ...p.value,
      ...(elim !== undefined ? { eliminationOrder: elim } : {}),
    });
  }
  // No explicit winnerUserIds for last-standing — every player without an
  // eliminationOrder is a survivor, and survivors are the winners by definition.
  // Require at least one survivor so the row isn't a "everyone got eliminated"
  // logical contradiction.
  if (players.every((p) => p.eliminationOrder !== undefined)) {
    return { ok: false, error: "last-standing: at least one player must survive" };
  }
  return { ok: true, value: { kind: "last-standing", players } };
}

function parseCoop(v: Record<string, unknown>): ParseResult<MatchOutcomeCoop> {
  if (!Array.isArray(v.participants) || v.participants.length === 0) {
    return { ok: false, error: "coop: participants must be non-empty" };
  }
  if (v.participants.length > 20) return { ok: false, error: "coop: too many participants" };
  const participants: Participant[] = [];
  for (let i = 0; i < v.participants.length; i++) {
    const p = parseParticipant(v.participants[i], `participants[${i}]`);
    if (!p.ok) return p;
    participants.push(p.value);
  }
  if (v.outcome !== "win" && v.outcome !== "loss") {
    return { ok: false, error: "coop: outcome must be 'win' or 'loss'" };
  }
  const difficulty = asOptionalString(v.difficulty, 64);
  const details = asOptionalString(v.details, 1000);
  return {
    ok: true,
    value: {
      kind: "coop",
      participants,
      outcome: v.outcome,
      ...(difficulty !== undefined ? { difficulty } : {}),
      ...(details !== undefined ? { details } : {}),
    },
  };
}

function parseOneVsMany(v: Record<string, unknown>): ParseResult<MatchOutcomeOneVsMany> {
  if (!isPlainObject(v.solo)) return { ok: false, error: "one-vs-many: solo missing" };
  const soloP = parseParticipant(v.solo, "solo");
  if (!soloP.ok) return soloP;
  const soloRoleLabel = asOptionalString(v.solo.roleLabel, 64);
  if (!isPlainObject(v.team)) return { ok: false, error: "one-vs-many: team missing" };
  if (!Array.isArray(v.team.members) || v.team.members.length === 0) {
    return { ok: false, error: "one-vs-many: team.members empty" };
  }
  const members: Participant[] = [];
  for (let i = 0; i < v.team.members.length; i++) {
    const p = parseParticipant(v.team.members[i], `team.members[${i}]`);
    if (!p.ok) return p;
    members.push(p.value);
  }
  if (members.some((m) => m.userId === soloP.value.userId)) {
    return { ok: false, error: "one-vs-many: solo cannot also be a team member" };
  }
  const teamRoleLabel = asOptionalString(v.team.roleLabel, 64);
  if (v.winnerSide !== "solo" && v.winnerSide !== "team") {
    return { ok: false, error: "one-vs-many: winnerSide must be 'solo' or 'team'" };
  }
  return {
    ok: true,
    value: {
      kind: "one-vs-many",
      solo: {
        ...soloP.value,
        ...(soloRoleLabel !== undefined ? { roleLabel: soloRoleLabel } : {}),
      },
      team: {
        members,
        ...(teamRoleLabel !== undefined ? { roleLabel: teamRoleLabel } : {}),
      },
      winnerSide: v.winnerSide,
    },
  };
}

export function parseOutcome(input: unknown): ParseResult<MatchOutcome> {
  if (!isPlainObject(input)) return { ok: false, error: "outcome must be an object" };
  switch (input.kind) {
    case "free-for-all":
      return parseFreeForAll(input);
    case "teams":
      return parseTeams(input);
    case "last-standing":
      return parseLastStanding(input);
    case "coop":
      return parseCoop(input);
    case "one-vs-many":
      return parseOneVsMany(input);
    default:
      return { ok: false, error: `unknown kind: ${String(input.kind)}` };
  }
}

export function collectUserIds(outcome: MatchOutcome): Set<string> {
  const ids = new Set<string>();
  switch (outcome.kind) {
    case "free-for-all":
    case "last-standing":
      for (const p of outcome.players) ids.add(p.userId);
      break;
    case "teams":
      for (const t of outcome.teams) for (const m of t.members) ids.add(m.userId);
      break;
    case "coop":
      for (const p of outcome.participants) ids.add(p.userId);
      break;
    case "one-vs-many":
      ids.add(outcome.solo.userId);
      for (const m of outcome.team.members) ids.add(m.userId);
      break;
  }
  return ids;
}

export function refreshDisplayNames(
  outcome: MatchOutcome,
  nameById: Map<string, string>,
): MatchOutcome {
  const fresh = (p: Participant): Participant => ({
    userId: p.userId,
    displayName: nameById.get(p.userId) ?? p.displayName,
  });
  switch (outcome.kind) {
    case "free-for-all":
      return {
        ...outcome,
        players: outcome.players.map((p) => ({ ...p, ...fresh(p) })),
      };
    case "teams":
      return {
        ...outcome,
        teams: outcome.teams.map((t) => ({
          ...t,
          // Spread the original member first so per-member fields like `role`
          // survive; then overlay fresh userId/displayName from the user table.
          members: t.members.map((m) => ({ ...m, ...fresh(m) })),
        })),
      };
    case "last-standing":
      return {
        ...outcome,
        players: outcome.players.map((p) => ({ ...p, ...fresh(p) })),
      };
    case "coop":
      return { ...outcome, participants: outcome.participants.map(fresh) };
    case "one-vs-many":
      return {
        ...outcome,
        solo: { ...outcome.solo, ...fresh(outcome.solo) },
        team: { ...outcome.team, members: outcome.team.members.map(fresh) },
      };
  }
}

const ISO_DATETIME_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?$/;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDateTime(v: unknown): v is string {
  return typeof v === "string" && ISO_DATETIME_RE.test(v);
}

export function isValidDateKey(v: unknown): v is string {
  return typeof v === "string" && DATE_KEY_RE.test(v);
}

export function isValidGameSlug(v: unknown): v is string {
  return typeof v === "string" && SLUG_RE.test(v);
}
