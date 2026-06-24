import type { MatchOutcomeFreeForAll, Participant } from "@boardgames/core/history/types";
import { useEffect } from "react";
import { lowScoreWinsForSlug } from "../../../games/score-config";
import { ordinal } from "../../../lib/match-result-badge";
import { ChevronDownIcon } from "../../icons";
import { Field } from "../../ui/Field";
import { IconButton } from "../../ui/IconButton";
import { Input } from "../../ui/Input";
import { ParticipantPicker } from "../ParticipantPicker";
import { PlayerRow } from "../PlayerRow";
import {
  breakTie,
  hasScoreTie,
  placementOrder,
  ranksEqual,
  reconcileRanks,
} from "./free-for-all-placement";

type User = { id: string; name: string };

type Player = MatchOutcomeFreeForAll["players"][number];

type Props = {
  users: User[];
  value: MatchOutcomeFreeForAll;
  onChange: (next: MatchOutcomeFreeForAll) => void;
  /** Used to flip the win direction for games like Phase 10 (lowest wins). */
  gameSlug: string | null;
};

export function FreeForAllForm({ users, value, onChange, gameSlug }: Props) {
  const selectedIds = value.players.map((p) => p.userId);
  const lowestWins = lowScoreWinsForSlug(gameSlug);
  const winningScore =
    value.players.length === 0
      ? null
      : lowestWins
        ? Math.min(...value.players.map((p) => p.score))
        : Math.max(...value.players.map((p) => p.score));

  // The untouched all-zero default isn't a real tie — don't pin placement or nag
  // to break it until actual scores are entered.
  function normalize(players: Player[]): Player[] {
    if (players.every((p) => p.score === 0)) return players.map((p) => ({ ...p, rank: undefined }));
    return reconcileRanks(players, lowestWins);
  }

  // Keep `rank` in sync with the scores so placement is never ambiguous — pins a
  // strict order on ties, clears it otherwise. Also migrates older tied records
  // (saved before tie-breaking existed) the moment they're opened for editing.
  // Idempotent and gated on a real change, so it converges in one pass.
  useEffect(() => {
    const reconciled = value.players.every((p) => p.score === 0)
      ? value.players.map((p) => ({ ...p, rank: undefined }))
      : reconcileRanks(value.players, lowestWins);
    if (!ranksEqual(value.players, reconciled)) onChange({ ...value, players: reconciled });
  }, [value, lowestWins, onChange]);

  // Write players back through the reconciler so `rank` always matches scores.
  function commit(players: Player[]) {
    onChange({ ...value, players: normalize(players) });
  }

  function setParticipants(participants: Participant[]) {
    const prevById = new Map(value.players.map((p) => [p.userId, p]));
    const players = participants.map((p) => {
      const prev = prevById.get(p.userId);
      return {
        ...p,
        score: prev?.score ?? 0,
        ...(prev?.rank !== undefined ? { rank: prev.rank } : {}),
      };
    });
    commit(players);
  }

  function setScore(userId: string, raw: string) {
    const num = Number.parseFloat(raw);
    const score = Number.isFinite(num) ? num : 0;
    commit(value.players.map((p) => (p.userId === userId ? { ...p, score } : p)));
  }

  const ranked = placementOrder(value.players, lowestWins);
  const tie = value.players.some((p) => p.score !== 0) && hasScoreTie(value.players);

  return (
    <div className="flex flex-col gap-3">
      <Field label="Players" htmlFor="ffa-players">
        <ParticipantPicker users={users} selectedIds={selectedIds} onChange={setParticipants} />
      </Field>
      {value.players.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-fg-secondary">
            Enter each player's score. {lowestWins ? "Lowest" : "Highest"} wins.
          </span>
          {value.players.map((p) => {
            const isLeading = winningScore !== null && p.score === winningScore;
            return (
              <PlayerRow
                key={p.userId}
                name={p.displayName}
                highlight={isLeading}
                right={
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={p.score}
                    onChange={(e) => setScore(p.userId, e.target.value)}
                    width="score"
                  />
                }
              />
            );
          })}
        </div>
      )}

      {tie && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-amber-200">Break the tie</span>
            <span className="text-2xs leading-snug text-fg-secondary">
              Players share a score. Use the arrows to order tied players so the placement is
              unambiguous — top is 1st.
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {ranked.map((p, i) => {
              const tiedAbove = i > 0 && ranked[i - 1].score === p.score;
              const tiedBelow = i < ranked.length - 1 && ranked[i + 1].score === p.score;
              return (
                <PlayerRow
                  key={p.userId}
                  highlight={i === 0}
                  name={
                    <span className="flex items-center gap-2">
                      <span className="w-7 shrink-0 text-2xs font-medium tabular-nums text-fg-muted">
                        {ordinal(i + 1)}
                      </span>
                      <span className="truncate">{p.displayName}</span>
                    </span>
                  }
                  right={<span className="text-xs tabular-nums text-fg-muted">{p.score}</span>}
                  actions={
                    tiedAbove || tiedBelow ? (
                      <div className="flex flex-col">
                        <IconButton
                          size="xs"
                          aria-label={`Move ${p.displayName} up`}
                          disabled={!tiedAbove}
                          onClick={() =>
                            commit(breakTie(value.players, p.userId, "up", lowestWins))
                          }
                          className="h-5 w-6 p-0"
                          icon={<ChevronDownIcon className="h-3 w-3 rotate-180" />}
                        />
                        <IconButton
                          size="xs"
                          aria-label={`Move ${p.displayName} down`}
                          disabled={!tiedBelow}
                          onClick={() =>
                            commit(breakTie(value.players, p.userId, "down", lowestWins))
                          }
                          className="h-5 w-6 p-0"
                          icon={<ChevronDownIcon className="h-3 w-3" />}
                        />
                      </div>
                    ) : null
                  }
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
