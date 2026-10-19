import { awardPoints, awardsForSlug } from "@boardgames/core/history/awards";
import type { MatchOutcomeFreeForAll, Participant } from "@boardgames/core/history/types";
import { useEffect } from "react";
import { lowScoreWinsForSlug } from "../../../games/score-config";
import { Chip } from "../../ui/Chip";
import type { PickerUser } from "../ParticipantPicker";
import { PlayerRow } from "../PlayerRow";
import { ScoreInput } from "../ScoreInput";
import { hasScoreTie, ranksEqual, reconcileRanks } from "./free-for-all-placement";
import { GroupLabel, OutcomeFormShell } from "./shared";
import { TieBreakPanel } from "./TieBreakPanel";

type User = PickerUser;

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
  // End-of-match awards (Publish or Perish, FlipToons): the score INPUT edits the base
  // (citations before awards); the stored `score` is always base + award
  // points, so placement, stats, and the rating engine read finals unchanged.
  const awardDefs = awardsForSlug(gameSlug);
  const baseOf = (p: Player) => p.score - awardPoints(gameSlug, p.awards);
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

  function setScore(userId: string, base: number) {
    commit(
      value.players.map((p) =>
        p.userId === userId ? { ...p, score: base + awardPoints(gameSlug, p.awards) } : p,
      ),
    );
  }

  function toggleAward(userId: string, awardId: string) {
    commit(
      value.players.map((p) => {
        if (p.userId !== userId) return p;
        const base = baseOf(p);
        const has = p.awards?.includes(awardId) ?? false;
        const awards = has
          ? (p.awards ?? []).filter((id) => id !== awardId)
          : [...(p.awards ?? []), awardId];
        return {
          ...p,
          score: base + awardPoints(gameSlug, awards),
          ...(awards.length > 0 ? { awards } : { awards: undefined }),
        };
      }),
    );
  }

  const tie = value.players.some((p) => p.score !== 0) && hasScoreTie(value.players);

  return (
    <OutcomeFormShell users={users} selectedIds={selectedIds} onParticipants={setParticipants}>
      {value.players.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <GroupLabel>
            {awardDefs.length > 0
              ? `Enter each player's score before awards. ${lowestWins ? "Lowest" : "Highest"} total wins.`
              : `Enter each player's score. ${lowestWins ? "Lowest" : "Highest"} wins.`}
          </GroupLabel>
          {value.players.map((p) => {
            const isLeading = winningScore !== null && p.score === winningScore;
            return (
              <PlayerRow
                key={p.userId}
                name={p.displayName}
                highlight={isLeading}
                right={
                  <span className="flex items-center gap-2">
                    {awardDefs.length > 0 && (
                      <span className="text-2xs tabular-nums text-fg-muted">= {p.score}</span>
                    )}
                    <ScoreInput
                      aria-label={`${p.displayName} — score`}
                      value={awardDefs.length > 0 ? baseOf(p) : p.score}
                      onValueChange={(n) => setScore(p.userId, n)}
                      width="score"
                    />
                  </span>
                }
              />
            );
          })}
        </div>
      )}

      {awardDefs.length > 0 && value.players.length > 0 && (
        <div className="flex flex-col gap-2">
          <GroupLabel>Awards — points are added to the total. Ties may share an award.</GroupLabel>
          {awardDefs.map((award) => (
            <div key={award.id} className="flex flex-wrap items-center gap-1.5">
              <span className="w-44 shrink-0 text-2xs text-fg-secondary">
                {award.label} <span className="tabular-nums text-fg-muted">(+{award.points})</span>
              </span>
              {value.players.map((p) => (
                <Chip
                  key={p.userId}
                  pressed={p.awards?.includes(award.id) ?? false}
                  tone="amber"
                  size="xs"
                  onClick={() => toggleAward(p.userId, award.id)}
                >
                  {p.displayName.split(" ")[0]}
                </Chip>
              ))}
            </div>
          ))}
        </div>
      )}

      {tie && (
        <TieBreakPanel
          players={value.players}
          lowestWins={lowestWins}
          onChange={(players) => commit(players)}
        />
      )}
    </OutcomeFormShell>
  );
}
