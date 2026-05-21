import type {
  MatchKind,
  MatchOutcome,
  MatchOutcomeCoop,
  MatchOutcomeFreeForAll,
  MatchOutcomeLastStanding,
  MatchOutcomeOneVsMany,
  MatchOutcomeTeams,
  MatchRecord,
  Participant,
} from "@boardgames/core/history/types";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { defaultKindForSlug } from "../../games/match-kinds";
import { variantConfigForSlug } from "../../games/match-variants";
import { authClient } from "../../lib/auth-client";
import { fetchCalendarLocks } from "../../lib/calendar-locks";
import { recordMatch, updateMatch } from "../../lib/match-history";
import { qk } from "../../lib/query-keys";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { ClocktowerForm } from "./forms/ClocktowerForm";
import { CoopForm } from "./forms/CoopForm";
import { FreeForAllForm } from "./forms/FreeForAllForm";
import { LastStandingForm } from "./forms/LastStandingForm";
import { OneVsManyForm } from "./forms/OneVsManyForm";
import { TeamsForm } from "./forms/TeamsForm";
import { WerewolfForm } from "./forms/WerewolfForm";
import { GamePicker } from "./GamePicker";
import { GameVariantPicker } from "./GameVariantPicker";

type User = { id: string; name: string };

const KIND_OPTIONS: { kind: MatchKind; label: string; hint: string }[] = [
  { kind: "free-for-all", label: "Free-for-all", hint: "Each player has a score; highest wins." },
  { kind: "teams", label: "Teams", hint: "Two or more teams; team scores compared." },
  { kind: "last-standing", label: "Elimination", hint: "Players eliminated; survivors win." },
  { kind: "coop", label: "Co-op", hint: "All players together vs the game." },
  { kind: "one-vs-many", label: "One vs many", hint: "One player against the rest (e.g. Mr. X)." },
];

type State = { mode: "create"; dateKey: string | null } | { mode: "edit"; match: MatchRecord };

type Props = {
  state: State;
  onClose: () => void;
  onSaved: () => void;
};

function isoNow(): string {
  return new Date().toISOString();
}

function emptyOutcome(kind: MatchKind, prefill: Participant[]): MatchOutcome {
  switch (kind) {
    case "free-for-all":
      return {
        kind,
        players: prefill.map((p) => ({ ...p, score: 0 })),
      };
    case "teams":
      // Drop the whole pre-filled roster into team 0 so the admin can split it
      // into actual teams from there. For ClocktowerForm / WerewolfForm — which
      // read every team's members as a single roster — this puts them all in
      // the per-player role picker immediately.
      return {
        kind,
        teams: [{ members: prefill.map((p) => ({ ...p })) }, { members: [] }],
        winnerTeamIndices: [],
      };
    case "last-standing":
      return { kind, players: prefill.map((p) => ({ ...p })) };
    case "coop":
      return { kind, participants: prefill.map((p) => ({ ...p })), outcome: "win" };
    case "one-vs-many":
      return {
        kind,
        solo: { userId: "", displayName: "" },
        team: { members: [] },
        winnerSide: "team",
      };
  }
}

function toCreateInput(state: {
  dateKey: string | null;
  playedAt: string;
  gameSlug: string | null;
  gameTitle: string;
  outcome: MatchOutcome;
  notes: string;
}) {
  return {
    dateKey: state.dateKey,
    playedAt: state.playedAt,
    gameSlug: state.gameSlug,
    gameTitle: state.gameTitle,
    outcome: state.outcome,
    notes: state.notes.trim() ? state.notes.trim() : null,
  };
}

export function RecordMatchModal({ state, onClose, onSaved }: Props) {
  const usersQuery = useQuery({
    queryKey: qk.adminUsers(),
    queryFn: async () => {
      const { data, error } = await authClient.admin.listUsers({ query: { limit: 200 } });
      if (error) throw new Error(error.message ?? "Failed to load users");
      return (data?.users ?? []) as unknown as Array<{ id: string; name: string }>;
    },
  });

  const locksQuery = useQuery({
    queryKey: qk.calendarLocks(),
    queryFn: ({ signal }) => fetchCalendarLocks(signal),
  });

  const allUsers: User[] = useMemo(
    () => (usersQuery.data ?? []).map((u) => ({ id: u.id, name: u.name })),
    [usersQuery.data],
  );

  // Initial values from edit-target or sensible defaults for create.
  const initial = useMemo(() => {
    if (state.mode === "edit") {
      return {
        dateKey: state.match.dateKey,
        playedAt: state.match.playedAt,
        gameSlug: state.match.gameSlug,
        gameTitle: state.match.gameTitle,
        kind: state.match.outcome.kind,
        outcome: state.match.outcome,
        notes: state.match.notes ?? "",
      };
    }
    return {
      dateKey: state.dateKey,
      playedAt: isoNow(),
      gameSlug: null as string | null,
      gameTitle: "",
      kind: "free-for-all" as MatchKind,
      outcome: emptyOutcome("free-for-all", []) as MatchOutcome,
      notes: "",
    };
  }, [state]);

  const [dateKey, setDateKey] = useState<string | null>(initial.dateKey);
  const [playedAt, setPlayedAt] = useState<string>(initial.playedAt);
  const [gameSlug, setGameSlug] = useState<string | null>(initial.gameSlug);
  const [gameTitle, setGameTitle] = useState<string>(initial.gameTitle);
  const [kind, setKind] = useState<MatchKind>(initial.kind);
  const [outcome, setOutcome] = useState<MatchOutcome>(initial.outcome);
  const [notes, setNotes] = useState<string>(initial.notes);
  const [error, setError] = useState<string | null>(null);

  // When a game night is picked, the match's date+time is implied by that
  // night's calendar entry — no separate "played at" picker needed. We
  // synthesize playedAt from the lock's eventTime (or 20:00 as a sane
  // default) the first time we see a given dateKey, and again whenever
  // the user changes it. In edit mode we keep the row's existing playedAt
  // until the user picks a *different* dateKey from the original.
  const lastDateKeyRef = useRef<string | null>(state.mode === "edit" ? state.match.dateKey : null);
  useEffect(() => {
    if (lastDateKeyRef.current === dateKey) return;
    lastDateKeyRef.current = dateKey;
    if (!dateKey) {
      if (state.mode === "create") setPlayedAt(isoNow());
      return;
    }
    const eventTime = locksQuery.data?.[dateKey]?.eventTime ?? "20:00";
    setPlayedAt(localInputToIso(`${dateKey}T${eventTime}`));
  }, [dateKey, locksQuery.data, state.mode]);

  // Auto-pick the match kind from the game's typical mode whenever the user
  // selects a registry game. Only fires when the slug actually changes so it
  // doesn't trample manual overrides. Skipped in edit mode — the row already
  // stores the kind the admin chose.
  const lastSlugRef = useRef<string | null>(initial.gameSlug);
  useEffect(() => {
    if (state.mode === "edit") return;
    if (lastSlugRef.current === gameSlug) return;
    lastSlugRef.current = gameSlug;
    const guess = defaultKindForSlug(gameSlug);
    if (!guess) return;
    setKind(guess);
    setOutcome((prev) => carryOverParticipants(guess, prev));
  }, [gameSlug, state.mode]);

  // Whenever the user picks a different game night, replace the participant
  // list with that night's RSVP=yes set. Switching nights without the players
  // refreshing is confusing — the previous night's people aren't relevant any
  // more. Skipped in edit mode and when clearing back to standalone.
  const lastPrefilledRef = useRef<string | null>(state.mode === "edit" ? "_edit_" : null);
  useEffect(() => {
    if (state.mode === "edit") return;
    if (allUsers.length === 0) return;
    if (lastPrefilledRef.current === dateKey) return;
    lastPrefilledRef.current = dateKey;
    if (!dateKey) return;
    const fromLock = locksQuery.data?.[dateKey];
    if (!fromLock) return;
    const yesIds = Object.entries(fromLock.rsvps ?? {})
      .filter(([, status]) => status === "yes")
      .map(([userId]) => userId);
    const participants: Participant[] = allUsers
      .filter((u) => yesIds.includes(u.id))
      .map((u) => ({ userId: u.id, displayName: u.name }));
    setOutcome((prev) => applyParticipants(prev.kind, prev, participants));
  }, [dateKey, allUsers, locksQuery.data, state.mode]);

  function changeKind(nextKind: MatchKind) {
    setKind(nextKind);
    setOutcome(carryOverParticipants(nextKind, outcome));
  }

  const playedAtId = useId();
  const dateKeyId = useId();
  const notesId = useId();

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmedTitle = gameTitle.trim();
      if (!trimmedTitle) throw new Error("Game title is required");
      const outcomeError = describeOutcomeError(outcome, gameSlug);
      if (outcomeError) throw new Error(outcomeError);
      const input = toCreateInput({
        dateKey,
        playedAt,
        gameSlug,
        gameTitle: trimmedTitle,
        outcome,
        notes,
      });
      if (state.mode === "edit") {
        return updateMatch(state.match.id, input);
      }
      return recordMatch(input);
    },
    onSuccess: () => onSaved(),
    onError: (e) => setError(e instanceof Error ? e.message : "Could not save"),
  });

  return (
    <Modal
      onClose={onClose}
      panelClassName="max-w-2xl max-h-[90vh]"
      eyebrow="History"
      title={state.mode === "edit" ? "Edit match" : "Record a match"}
    >
      <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-2">
        <Field label="Game" htmlFor="rmm-game">
          <GamePicker
            slug={gameSlug}
            title={gameTitle}
            onChange={({ slug, title }) => {
              setGameSlug(slug);
              setGameTitle(title);
            }}
          />
        </Field>

        <Field
          label="Game night"
          htmlFor={dateKeyId}
          hint={
            dateKey
              ? "Time taken from the night's calendar entry"
              : "Pick a locked night, or leave standalone for a one-off"
          }
        >
          <select
            id={dateKeyId}
            value={dateKey ?? ""}
            onChange={(e) => setDateKey(e.target.value || null)}
            className="w-full rounded-lg border border-white/10 bg-surface-900 px-3 py-2 text-sm text-gray-100"
          >
            <option value="">Standalone (no calendar lock)</option>
            {sortLockKeys(Object.keys(locksQuery.data ?? {})).map((d) => (
              <option key={d} value={d}>
                {d}
                {locksQuery.data?.[d]?.host?.name ? ` — ${locksQuery.data[d].host?.name}` : ""}
              </option>
            ))}
          </select>
        </Field>

        {!dateKey && (
          <Field label="Played at" htmlFor={playedAtId}>
            <Input
              id={playedAtId}
              type="datetime-local"
              value={isoToLocalInput(playedAt)}
              onChange={(e) => setPlayedAt(localInputToIso(e.target.value))}
            />
          </Field>
        )}

        <Field label="Match type" htmlFor="rmm-kind">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {KIND_OPTIONS.map((opt) => (
              <Chip
                key={opt.kind}
                pressed={kind === opt.kind}
                tone="accent"
                size="sm"
                block
                title={opt.hint}
                onClick={() => changeKind(opt.kind)}
              >
                {opt.label}
              </Chip>
            ))}
          </div>
        </Field>

        {variantConfigForSlug(gameSlug) && (
          <GameVariantPicker gameSlug={gameSlug} outcome={outcome} onChange={setOutcome} />
        )}

        <div className="rounded-xl border border-white/5 bg-surface-900/40 p-3">
          {kind === "free-for-all" && (
            <FreeForAllForm
              users={allUsers}
              value={outcome as MatchOutcomeFreeForAll}
              onChange={setOutcome}
              gameSlug={gameSlug}
            />
          )}
          {kind === "teams" &&
            (gameSlug === "blood-on-the-clocktower" ? (
              <ClocktowerForm
                users={allUsers}
                value={outcome as MatchOutcomeTeams}
                onChange={setOutcome}
              />
            ) : gameSlug === "one-night-ultimate-werewolf" ? (
              <WerewolfForm
                users={allUsers}
                value={outcome as MatchOutcomeTeams}
                onChange={setOutcome}
              />
            ) : (
              <TeamsForm
                users={allUsers}
                value={outcome as MatchOutcomeTeams}
                onChange={setOutcome}
                gameSlug={gameSlug}
              />
            ))}
          {kind === "last-standing" && (
            <LastStandingForm
              users={allUsers}
              value={outcome as MatchOutcomeLastStanding}
              onChange={setOutcome}
            />
          )}
          {kind === "coop" && (
            <CoopForm users={allUsers} value={outcome as MatchOutcomeCoop} onChange={setOutcome} />
          )}
          {kind === "one-vs-many" && (
            <OneVsManyForm
              users={allUsers}
              value={outcome as MatchOutcomeOneVsMany}
              onChange={setOutcome}
            />
          )}
        </div>

        <Field label="Notes" htmlFor={notesId} hint="Optional, max 2000 chars">
          <textarea
            id={notesId}
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 2000))}
            rows={3}
            className="w-full rounded-lg border border-white/10 bg-surface-900 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:border-accent-400/60 focus:outline-none focus:ring-2 focus:ring-accent-400/30"
            placeholder="Anything memorable…"
          />
        </Field>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 pt-3">
        {error ? (
          <span className="text-xs text-rose-400">{error}</span>
        ) : (
          <span className="text-xs text-gray-500">
            {usersQuery.isLoading ? "Loading users…" : `${allUsers.length} known players`}
          </span>
        )}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {state.mode === "edit" ? "Save" : "Record"}
          </Button>
        </div>
      </footer>
    </Modal>
  );
}

/**
 * Sort the game-night dropdown: today and past nights only (newest → oldest).
 * Future-dated locks are filtered out — you can't record a match for a game
 * night that hasn't happened yet.
 */
function sortLockKeys(keys: string[]): string[] {
  const today = new Date().toISOString().slice(0, 10);
  return keys.filter((k) => k <= today).sort((a, b) => b.localeCompare(a));
}

function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const tz = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tz * 60_000);
  return local.toISOString().slice(0, 16);
}

function localInputToIso(local: string): string {
  if (!local) return new Date().toISOString();
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

/**
 * Pre-flight check run before we hit the wire schema. The Zod request schema
 * is correct but the errors it surfaces ("Invalid input" at
 * `outcome.winnerTeamIndices`) are useless to a human. Catch the empty/missing
 * cases here so the admin gets actionable feedback instead.
 */
function describeOutcomeError(outcome: MatchOutcome, gameSlug: string | null): string | null {
  switch (outcome.kind) {
    case "free-for-all":
      if (outcome.players.length < 2) return "Add at least two players";
      return null;
    case "teams":
      if (gameSlug === "blood-on-the-clocktower") return describeClocktowerError(outcome);
      if (gameSlug === "one-night-ultimate-werewolf") return describeWerewolfError(outcome);
      return describeGenericTeamsError(outcome);
    case "last-standing":
      if (outcome.players.length < 2) return "Add at least two players";
      if (outcome.players.every((p) => p.eliminationOrder !== undefined))
        return "At least one player must survive";
      return null;
    case "coop":
      if (outcome.participants.length < 1) return "Add at least one participant";
      return null;
    case "one-vs-many":
      if (!outcome.solo.userId) return "Pick the solo player";
      if (outcome.team.members.length < 1) return "Add at least one team player";
      return null;
  }
}

function describeGenericTeamsError(outcome: MatchOutcomeTeams): string | null {
  const empty = outcome.teams.findIndex((t) => t.members.length === 0);
  if (empty !== -1) return `Team ${empty + 1} needs at least one player`;
  if (outcome.winnerTeamIndices.length === 0) return "Pick at least one winning team";
  return null;
}

function describeWerewolfError(outcome: MatchOutcomeTeams): string | null {
  const allMembers = outcome.teams.flatMap((t) => t.members);
  if (allMembers.length === 0) return "Add players";
  const unassigned = allMembers.find((m) => !m.role);
  if (unassigned) return `Pick a role for ${unassigned.displayName}`;
  if (outcome.teams.length < 2)
    return "Match needs at least one Werewolf, Minion, or Tanner besides Village";
  if (outcome.winnerTeamIndices.length === 0)
    return "No winning team — adjust roles or vote-outs so a side wins";
  return null;
}

function describeClocktowerError(outcome: MatchOutcomeTeams): string | null {
  const allMembers = outcome.teams.flatMap((t) => t.members);
  if (allMembers.length === 0) return "Add players";
  const unassigned = allMembers.find((m) => !m.role);
  if (unassigned) return `Pick a character for ${unassigned.displayName}`;
  const [good, evil] = outcome.teams;
  if (!good || good.members.length === 0) return "At least one good player is required";
  if (!evil || evil.members.length === 0) return "At least one evil player is required";
  if (outcome.winnerTeamIndices.length === 0) return "Pick the winning side";
  return null;
}

/**
 * Pull whatever participants the user has already selected into the new kind's
 * shape so we don't lose work when they flip the type. Only safe across kinds
 * that operate on a flat list of players (free-for-all, last-standing, coop).
 * Teams and one-vs-many start fresh because their slots are structurally
 * different.
 */
function carryOverParticipants(nextKind: MatchKind, prev: MatchOutcome): MatchOutcome {
  const flat = flatParticipants(prev);
  return applyParticipants(nextKind, emptyOutcome(nextKind, flat), flat);
}

function flatParticipants(outcome: MatchOutcome): Participant[] {
  switch (outcome.kind) {
    case "free-for-all":
    case "last-standing":
      return outcome.players.map((p) => ({ userId: p.userId, displayName: p.displayName }));
    case "teams":
      return outcome.teams.flatMap((t) => t.members);
    case "coop":
      return outcome.participants;
    case "one-vs-many":
      return [
        ...(outcome.solo.userId
          ? [{ userId: outcome.solo.userId, displayName: outcome.solo.displayName }]
          : []),
        ...outcome.team.members,
      ];
  }
}

function applyParticipants(
  kind: MatchKind,
  base: MatchOutcome,
  participants: Participant[],
): MatchOutcome {
  switch (kind) {
    case "free-for-all": {
      const ffa = base as MatchOutcomeFreeForAll;
      const scoreById = new Map(ffa.players.map((p) => [p.userId, p.score]));
      return {
        ...ffa,
        players: participants.map((p) => ({ ...p, score: scoreById.get(p.userId) ?? 0 })),
      };
    }
    case "last-standing": {
      const ls = base as MatchOutcomeLastStanding;
      const elimById = new Map(ls.players.map((p) => [p.userId, p.eliminationOrder]));
      return {
        ...ls,
        players: participants.map((p) => ({
          ...p,
          ...(elimById.get(p.userId) !== undefined
            ? { eliminationOrder: elimById.get(p.userId) }
            : {}),
        })),
      };
    }
    case "coop":
      return { ...(base as MatchOutcomeCoop), participants };
    case "teams": {
      // Re-load the picked-night's roster into team 0 (or team 1 if the form
      // already has team-1 members alongside an empty team 0 — preserves edits
      // the admin already made). Roles get carried over when the same userId
      // re-appears so we don't wipe a partially-assigned Clocktower/Werewolf
      // form on a re-prefill.
      const teamsBase = base as MatchOutcomeTeams;
      const existingByUserId = new Map(
        teamsBase.teams.flatMap((t) => t.members.map((m) => [m.userId, m] as const)),
      );
      const dumpInto =
        teamsBase.teams[0].members.length === 0 && teamsBase.teams[1]?.members.length ? 1 : 0;
      const teams = teamsBase.teams.map((t, i) => {
        if (i !== dumpInto) return t;
        return {
          ...t,
          members: participants.map((p) => existingByUserId.get(p.userId) ?? p),
        };
      });
      return { ...teamsBase, teams };
    }
    case "one-vs-many":
      return base;
  }
}
