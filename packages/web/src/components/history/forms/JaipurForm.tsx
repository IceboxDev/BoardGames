import {
  MAX_ROUND_SCORES,
  MIN_ROUND_SCORES,
  resolveRound,
  roundScoreLeaders,
  roundWinCounts,
} from "@boardgames/core/history/round-scores";
import type { MatchOutcomeFreeForAll, Participant } from "@boardgames/core/history/types";
import { useEffect } from "react";
import { JAIPUR_BEST_OF_ONE } from "../../../games/match-variants";
import { Chip } from "../../ui/Chip";
import { Input } from "../../ui/Input";
import { PlayerRow } from "../PlayerRow";
import { FreeForAllForm } from "./FreeForAllForm";
import { jaipurOutcomesEqual, normalizeJaipurOutcome } from "./jaipur-rounds";
import { GroupLabel, mergeParticipants, OutcomeFormShell } from "./shared";

// Jaipur is a best-of-three (see match-variants): each round banks rupees, the
// round's high score takes its Seal of Excellence, two seals win the MATCH —
// so the winner can hold a LOWER rupee total than the loser. The form records
// the per-round rupees (`roundScores`) and derives the summed `score` and the
// seal-based placement (`rank`). A rupee-tied round opens the rulebook's
// tiebreaker fields — most BONUS tokens takes the seal, still tied most GOODS
// tokens — recorded in `roundTiebreaks`, so the seal is always derived, never
// picked by hand. The "Best of 1" format collapses to the plain score form.

type User = { id: string; name: string };

type Props = {
  users: User[];
  value: MatchOutcomeFreeForAll;
  onChange: (next: MatchOutcomeFreeForAll) => void;
};

export function JaipurForm({ users, value, onChange }: Props) {
  const bestOfOne = value.scenario === JAIPUR_BEST_OF_ONE;

  // Flipping the format to "Best of 1" leaves stale round records on the
  // outcome — strip them so the plain score form's edits stay wire-valid.
  useEffect(() => {
    if (!bestOfOne) return;
    if (!value.players.some((p) => p.roundScores !== undefined) && !value.roundTiebreaks) return;
    const { roundTiebreaks: _tb, ...rest } = value;
    onChange({ ...rest, players: value.players.map(({ roundScores: _drop, ...p }) => p) });
  }, [bestOfOne, value, onChange]);

  if (bestOfOne) {
    return <FreeForAllForm users={users} value={value} onChange={onChange} gameSlug="jaipur" />;
  }
  return <JaipurRoundsForm users={users} value={value} onChange={onChange} />;
}

function JaipurRoundsForm({ users, value, onChange }: Props) {
  const selectedIds = value.players.map((p) => p.userId);
  const roundCount = Math.min(
    MAX_ROUND_SCORES,
    Math.max(MIN_ROUND_SCORES, value.players[0]?.roundScores?.length ?? MAX_ROUND_SCORES),
  );

  // Keep the outcome normalized (rounds padded, totals summed, tiebreak
  // entries opened/closed as rounds tie, seals ranked) — covers players
  // arriving from the night prefill without round records, and records opened
  // for editing. Idempotent, so it converges in one pass.
  useEffect(() => {
    const normalized = normalizeJaipurOutcome(value, roundCount);
    if (!jaipurOutcomesEqual(value, normalized)) onChange(normalized);
  }, [value, onChange, roundCount]);

  function commit(next: MatchOutcomeFreeForAll, rounds = roundCount) {
    onChange(normalizeJaipurOutcome(next, rounds));
  }

  function setParticipants(participants: Participant[]) {
    commit({
      ...value,
      players: mergeParticipants(value.players, participants, (p) => ({ ...p, score: 0 })),
    });
  }

  function parseCount(raw: string): number {
    const num = Number.parseFloat(raw);
    return Number.isFinite(num) ? num : 0;
  }

  function setRoundScore(userId: string, round: number, raw: string) {
    const score = parseCount(raw);
    commit({
      ...value,
      players: value.players.map((p) =>
        p.userId === userId
          ? { ...p, roundScores: (p.roundScores ?? []).map((s, i) => (i === round ? score : s)) }
          : p,
      ),
    });
  }

  function setTiebreakToken(
    round: number,
    playerIdx: number,
    kind: "bonus" | "goods",
    raw: string,
  ) {
    // Token counts are small non-negative integers; 100 is the wire schema's cap.
    const count = Math.min(100, Math.max(0, Math.trunc(parseCount(raw))));
    commit({
      ...value,
      roundTiebreaks: (value.roundTiebreaks ?? []).map((tb) => {
        if (tb.round !== round) return tb;
        const patch = (tokens: readonly number[] | undefined) =>
          (tokens ?? value.players.map(() => 0)).map((t, i) => (i === playerIdx ? count : t));
        return kind === "bonus"
          ? { ...tb, bonusTokens: patch(tb.bonusTokens) }
          : { ...tb, goodsTokens: patch(tb.goodsTokens) };
      }),
    });
  }

  const wins = roundWinCounts(value.players, value.roundTiebreaks);

  return (
    <OutcomeFormShell users={users} selectedIds={selectedIds} onParticipants={setParticipants}>
      <div className="flex items-center gap-2">
        <GroupLabel>Rounds played</GroupLabel>
        <Chip
          pressed={roundCount === 2}
          tone="accent"
          variant="outlined"
          size="sm"
          onClick={() => commit(value, 2)}
        >
          2 (swept)
        </Chip>
        <Chip
          pressed={roundCount === 3}
          tone="accent"
          variant="outlined"
          size="sm"
          onClick={() => commit(value, 3)}
        >
          3
        </Chip>
      </div>

      {value.players.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <GroupLabel>
            Enter each round's rupees — the round's high score takes its Seal of Excellence, and
            most seals wins the match.
          </GroupLabel>
          <div className="flex items-center gap-2">
            <span className="flex-1" />
            <div className="flex items-center gap-1.5">
              {Array.from({ length: roundCount }, (_, r) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: rounds are positional by nature.
                <span key={r} className="w-14 text-center text-2xs font-medium text-fg-muted">
                  R{r + 1}
                </span>
              ))}
              <span className="w-10 text-center text-2xs font-medium text-fg-muted">Seals</span>
            </div>
          </div>
          {value.players.map((p, idx) => (
            <PlayerRow
              key={p.userId}
              name={p.displayName}
              highlight={p.rank === 1}
              right={
                <div className="flex items-center gap-1.5">
                  {(p.roundScores ?? []).map((s, r) => (
                    <Input
                      // biome-ignore lint/suspicious/noArrayIndexKey: rounds are positional by nature.
                      key={r}
                      type="number"
                      inputMode="numeric"
                      aria-label={`${p.displayName} — round ${r + 1} rupees`}
                      value={s}
                      onChange={(e) => setRoundScore(p.userId, r, e.target.value)}
                      width="auto"
                      className="w-14 px-2 text-right tabular-nums"
                    />
                  ))}
                  <span
                    className={`w-10 text-center text-xs tabular-nums ${
                      wins[idx] > 0 ? "text-amber-300" : "text-fg-disabled"
                    }`}
                    title={`${wins[idx]} seal${wins[idx] === 1 ? "" : "s"} of excellence`}
                  >
                    {wins[idx] > 0 ? "✦".repeat(wins[idx]) : "—"}
                  </span>
                </div>
              }
            />
          ))}
        </div>
      )}

      {(value.roundTiebreaks ?? []).map((tb) => {
        const leaders = roundScoreLeaders(value.players, tb.round);
        const resolution = resolveRound(value.players, tb.round, tb);
        return (
          <div
            key={tb.round}
            className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-amber-200">
                Round {tb.round + 1} is tied at{" "}
                {value.players[leaders[0]]?.roundScores?.[tb.round] ?? 0} rupees
              </span>
              <span className="text-2xs leading-snug text-fg-secondary">
                The most bonus tokens takes the seal — still tied, the most goods tokens.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex-1" />
              <div className="flex items-center gap-1.5">
                <span className="w-14 text-center text-2xs font-medium text-fg-muted">Bonus</span>
                {tb.goodsTokens && (
                  <span className="w-14 text-center text-2xs font-medium text-fg-muted">Goods</span>
                )}
              </div>
            </div>
            {leaders.map((i) => {
              const p = value.players[i];
              return (
                <PlayerRow
                  key={p.userId}
                  name={p.displayName}
                  highlight={resolution.winner === i}
                  right={
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        inputMode="numeric"
                        aria-label={`${p.displayName} — round ${tb.round + 1} bonus tokens`}
                        value={tb.bonusTokens[i] ?? 0}
                        onChange={(e) => setTiebreakToken(tb.round, i, "bonus", e.target.value)}
                        width="auto"
                        className="w-14 px-2 text-right tabular-nums"
                      />
                      {tb.goodsTokens && (
                        <Input
                          type="number"
                          inputMode="numeric"
                          aria-label={`${p.displayName} — round ${tb.round + 1} goods tokens`}
                          value={tb.goodsTokens[i] ?? 0}
                          onChange={(e) => setTiebreakToken(tb.round, i, "goods", e.target.value)}
                          width="auto"
                          className="w-14 px-2 text-right tabular-nums"
                        />
                      )}
                    </div>
                  }
                />
              );
            })}
          </div>
        );
      })}
    </OutcomeFormShell>
  );
}
