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
import { useAdminUsers } from "../../hooks/useAdminUsers.ts";
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
import {
  applyParticipants,
  carryOverParticipants,
  describeOutcomeError,
  emptyOutcome,
  isoNow,
  isoToLocalInput,
  localInputToIso,
  sortLockKeys,
  toCreateInput,
} from "./outcome";

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

export function RecordMatchModal({ state, onClose, onSaved }: Props) {
  // Shared with the AdminPage user table — both consume the validated
  // rows from the same qk.adminUsers() cache entry, so opening the modal
  // while the admin page is open does not re-fetch.
  const usersQuery = useAdminUsers();

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
