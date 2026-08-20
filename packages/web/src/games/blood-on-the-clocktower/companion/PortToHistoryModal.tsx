import {
  CHARACTERS,
  EDITION_NAME,
} from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type { CompanionState } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import { isEvilPlayer } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import type { MatchOutcomeTeams } from "@boardgames/core/history/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button, ErrorAlert, Modal, ModalBody, ModalFooter, Select } from "../../../components/ui";
import { useAdminUsers } from "../../../hooks/useAdminUsers";
import { fetchCalendarLocks } from "../../../lib/calendar-locks";
import { recordMatch } from "../../../lib/match-history";
import { dateKey } from "../../../lib/offline-availability";
import { qk } from "../../../lib/query-keys";
import type { UpdateState } from "./Companion";
import { CharacterIcon } from "./common";
import { TYPE_TEXT } from "./labels";
import { hasDuplicateAccounts, NOBODY } from "./port-helpers";

/**
 * Ports a finished companion game into match history (admin-only — the write
 * endpoint is `/api/admin/history`). Companion players are free-text names;
 * this modal maps each one to a registered user (auto-matched by name, fixable
 * per row), builds the same `teams` outcome shape ClocktowerForm produces
 * (good = team 0, evil = team 1, `role` = character name, Storyteller =
 * moderator, scenario = "Trouble Brewing"), and attaches the match to
 * tonight's game night when one is locked.
 */
export default function PortToHistoryModal({
  state,
  update,
  onClose,
}: {
  state: CompanionState;
  update: UpdateState;
  onClose: () => void;
}) {
  const usersQuery = useAdminUsers();
  const users = usersQuery.data ?? [];
  const queryClient = useQueryClient();

  const locksQuery = useQuery({
    queryKey: qk.calendarLocks(),
    queryFn: ({ signal }) => fetchCalendarLocks(signal),
  });
  const todayKey = dateKey(new Date());
  const nightKey = locksQuery.data?.[todayKey] ? todayKey : null;

  const byLowerName = useMemo(
    () => new Map(users.map((u) => [u.name.toLowerCase(), u.id] as const)),
    [users],
  );
  // seat -> userId ("" = unmatched). Auto-match by exact name once users load.
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [storytellerId, setStorytellerId] = useState<string | undefined>();
  const resolved = (seat: number, name: string) =>
    mapping[seat] ?? byLowerName.get(name.toLowerCase()) ?? NOBODY;
  const resolvedStoryteller =
    storytellerId ??
    (state.storyteller ? (byLowerName.get(state.storyteller.toLowerCase()) ?? NOBODY) : NOBODY);

  const chosenIds = state.players.map((p) => resolved(p.seat, p.name));
  const allMapped = chosenIds.every((id) => id !== NOBODY);
  const hasDuplicates = hasDuplicateAccounts(chosenIds);
  const winner = state.phase.kind === "ended" ? state.phase.winner : "good";

  const mutation = useMutation({
    mutationFn: () => {
      const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? "";
      const good: MatchOutcomeTeams["teams"][number]["members"] = [];
      const evil: MatchOutcomeTeams["teams"][number]["members"] = [];
      for (const p of state.players) {
        const userId = resolved(p.seat, p.name);
        (isEvilPlayer(p) ? evil : good).push({
          userId,
          displayName: nameOf(userId),
          role: CHARACTERS[p.character].name,
        });
      }
      const outcome: MatchOutcomeTeams = {
        kind: "teams",
        teams: [{ members: good }, { members: evil }],
        winnerTeamIndices: [winner === "good" ? 0 : 1],
        ...(resolvedStoryteller !== NOBODY
          ? {
              moderator: {
                userId: resolvedStoryteller,
                displayName: nameOf(resolvedStoryteller),
              },
            }
          : {}),
        scenario: EDITION_NAME[state.script],
      };
      return recordMatch({
        dateKey: nightKey,
        playedAt: new Date().toISOString(),
        gameSlug: "blood-on-the-clocktower",
        gameTitle: "Blood on the Clocktower",
        outcome,
        notes: null,
      });
    },
    onSuccess: (match) => {
      queryClient.invalidateQueries({ queryKey: qk.history() });
      update((s) => ({ ...s, historyMatchId: match.id }));
      onClose();
    },
  });

  return (
    <Modal size="sm" onClose={onClose} eyebrow="Match history" title="Record this game">
      <ModalBody>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg-secondary">
            <b className={winner === "good" ? "text-sky-300" : "text-rose-300"}>
              {winner === "good" ? "Good" : "Evil"} won
            </b>{" "}
            · {EDITION_NAME[state.script]} ·{" "}
            {nightKey ? "attached to tonight's game night" : "not attached to a game night"}. Match
            each player to their account:
          </p>

          <div className="flex flex-col gap-1.5">
            {state.players.map((p) => (
              <div key={p.seat} className="flex min-h-11 items-center gap-2">
                <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
                  <CharacterIcon character={p.character} size="sm" />
                  {/* Name over character: each line truncates with an ellipsis
                      instead of raw-clipping against the fixed-width select. */}
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-fg-primary">{p.name}</span>
                    <span className={`truncate text-xs ${TYPE_TEXT[CHARACTERS[p.character].type]}`}>
                      {CHARACTERS[p.character].name}
                    </span>
                  </span>
                </span>
                <Select
                  aria-label={`Account for ${p.name}`}
                  block={false}
                  size="sm"
                  value={resolved(p.seat, p.name)}
                  onChange={(e) => setMapping((m) => ({ ...m, [p.seat]: e.target.value }))}
                  className="w-40 shrink-0"
                >
                  <option value={NOBODY}>— pick account…</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
            {state.storyteller && (
              <div className="flex min-h-11 items-center gap-2 border-t border-white/10 pt-1.5">
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="text-fg-primary">{state.storyteller}</span>{" "}
                  <span className="text-xs text-amber-300">Storyteller</span>
                </span>
                <Select
                  aria-label={`Account for Storyteller ${state.storyteller}`}
                  block={false}
                  size="sm"
                  value={resolvedStoryteller}
                  onChange={(e) => setStorytellerId(e.target.value)}
                  className="w-40 shrink-0"
                >
                  <option value={NOBODY}>— not recorded</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          {hasDuplicates && (
            <p className="text-xs font-semibold text-rose-300">
              Two players are mapped to the same account — fix before recording.
            </p>
          )}
          {mutation.isError && (
            <ErrorAlert
              message={
                mutation.error instanceof Error ? mutation.error.message : "Failed to record"
              }
            />
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!allMapped || hasDuplicates || mutation.isPending}
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          Record match
        </Button>
      </ModalFooter>
    </Modal>
  );
}
