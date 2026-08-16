import {
  DECRYPTO_RECORD_MAX_ROUNDS,
  type DecryptoTiebreak,
  type DecryptoTokenRound,
  deriveDecryptoOutcome,
} from "@boardgames/core/history/decrypto-tokens";
import type { MatchOutcomeTeams, Participant } from "@boardgames/core/history/types";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { ParticipantPicker } from "../ParticipantPicker";
import { PlayerRow } from "../PlayerRow";
import { GroupLabel, OutcomeFormShell } from "./shared";

type User = { id: string; name: string };
type Side = 0 | 1; // 0 = White, 1 = Black
type Slot = { userId: string; displayName: string; side: Side };

type Props = {
  users: User[];
  value: MatchOutcomeTeams;
  onChange: (next: MatchOutcomeTeams) => void;
};

/**
 * Match-history form for Decrypto. Records the game in its own currency:
 * players split into the White and Black teams, then each round's token
 * awards — a WHITE interception token (cracked the enemy code) and/or a BLACK
 * miscommunication token (misread their own encryptor) per team. The winner
 * is never picked by hand: `deriveDecryptoOutcome` walks the tokens exactly
 * like the rulebook (2 interceptions win, 2 miscommunications lose,
 * simultaneous thresholds → points, a points tie → the keyword-guess
 * tiebreaker, which is the one question this form ever asks). The variant
 * `scenario` tag is preserved on every change.
 */
export function DecryptoForm({ users, value, onChange }: Props) {
  const roster = flattenRoster(value);
  const selectedIds = roster.map((s) => s.userId);
  const rounds = value.decryptoRounds ?? [];
  const derived = deriveDecryptoOutcome(rounds, value.decryptoTiebreak);

  function commit(next: {
    roster?: Slot[];
    rounds?: DecryptoTokenRound[];
    tiebreak?: DecryptoTiebreak | undefined;
  }) {
    const slots = next.roster ?? roster;
    const nextRounds = next.rounds ?? rounds;
    // Keep the tiebreak answer only while the token walk actually ends on
    // tied points — editing a round can invalidate a previous answer.
    const candidate = "tiebreak" in next ? next.tiebreak : value.decryptoTiebreak;
    const withoutTiebreak = deriveDecryptoOutcome(nextRounds);
    const tiebreak = withoutTiebreak.status === "needs-tiebreak" ? candidate : undefined;
    const resolved = deriveDecryptoOutcome(nextRounds, tiebreak);

    const members: [Slot[], Slot[]] = [[], []];
    for (const s of slots) members[s.side].push(s);
    const points = totalPoints(nextRounds);

    onChange({
      kind: "teams",
      teams: ([0, 1] as const).map((side) => ({
        members: members[side].map(({ userId, displayName }) => ({ userId, displayName })),
        ...(nextRounds.length > 0 ? { score: points[side] } : {}),
      })) as MatchOutcomeTeams["teams"],
      winnerTeamIndices: resolved.status === "decided" ? resolved.winners : [],
      ...(nextRounds.length > 0 ? { decryptoRounds: nextRounds } : {}),
      ...(tiebreak !== undefined ? { decryptoTiebreak: tiebreak } : {}),
      ...(value.scenario ? { scenario: value.scenario } : {}),
    });
  }

  function setPlayers(participants: Participant[]) {
    const sideById = new Map(roster.map((s) => [s.userId, s.side] as const));
    commit({
      roster: participants.map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        side: sideById.get(p.userId) ?? 0,
      })),
    });
  }

  function toggleToken(roundIdx: number, kind: keyof DecryptoTokenRound, side: Side) {
    commit({
      rounds: rounds.map((r, i) =>
        i === roundIdx
          ? {
              ...r,
              [kind]: r[kind].map((v, s) => (s === side ? !v : v)) as [boolean, boolean],
            }
          : r,
      ),
    });
  }

  const whiteCount = roster.filter((s) => s.side === 0).length;
  const blackCount = roster.filter((s) => s.side === 1).length;
  const canAddRound = derived.status !== "decided" && rounds.length < DECRYPTO_RECORD_MAX_ROUNDS;

  return (
    <OutcomeFormShell>
      <div>
        <GroupLabel>Players</GroupLabel>
        <ParticipantPicker users={users} selectedIds={selectedIds} onChange={setPlayers} />
      </div>

      {roster.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <GroupLabel>Assign teams</GroupLabel>
            <span className="text-2xs text-fg-muted">
              <span className="text-fg-primary">White {whiteCount}</span>
              <span className="px-1 text-fg-disabled">·</span>
              <span className="text-fg-secondary">Black {blackCount}</span>
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {roster.map((slot) => (
              <PlayerRow
                key={slot.userId}
                name={slot.displayName}
                right={
                  <div className="flex gap-1">
                    <Chip
                      pressed={slot.side === 0}
                      tone="sky"
                      size="xs"
                      onClick={() =>
                        commit({
                          roster: roster.map((s) =>
                            s.userId === slot.userId ? { ...s, side: 0 as const } : s,
                          ),
                        })
                      }
                    >
                      White
                    </Chip>
                    <Chip
                      pressed={slot.side === 1}
                      tone="amber"
                      size="xs"
                      onClick={() =>
                        commit({
                          roster: roster.map((s) =>
                            s.userId === slot.userId ? { ...s, side: 1 as const } : s,
                          ),
                        })
                      }
                    >
                      Black
                    </Chip>
                  </div>
                }
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <GroupLabel>Tokens per round</GroupLabel>
        <p className="text-2xs leading-snug text-fg-muted">
          ⚪ = interception token (cracked the enemy code) · ⚫ = miscommunication token (misread
          your own clues). Round 1 has no interception attempts.
        </p>
        {rounds.map((round, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: rounds are positional
            key={i}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface-800/40 px-2 py-1.5"
          >
            <span className="w-7 shrink-0 text-2xs font-bold text-fg-secondary">R{i + 1}</span>
            {([0, 1] as const).map((side) => (
              <span key={side} className="flex items-center gap-1">
                <span className="text-2xs font-semibold text-fg-muted">
                  {side === 0 ? "White" : "Black"}
                </span>
                <Chip
                  pressed={round.interception[side]}
                  tone="emerald"
                  size="xs"
                  disabled={i === 0}
                  onClick={() => toggleToken(i, "interception", side)}
                  title="Interception token"
                >
                  ⚪
                </Chip>
                <Chip
                  pressed={round.miscommunication[side]}
                  tone="rose"
                  size="xs"
                  onClick={() => toggleToken(i, "miscommunication", side)}
                  title="Miscommunication token"
                >
                  ⚫
                </Chip>
              </span>
            ))}
          </div>
        ))}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="xs"
            disabled={!canAddRound}
            onClick={() =>
              commit({
                rounds: [
                  ...rounds,
                  { interception: [false, false], miscommunication: [false, false] },
                ],
              })
            }
          >
            + Add round
          </Button>
          {rounds.length > 0 && (
            <Button
              variant="secondary"
              size="xs"
              onClick={() => commit({ rounds: rounds.slice(0, -1) })}
            >
              − Remove last
            </Button>
          )}
        </div>
      </div>

      {derived.status === "needs-tiebreak" && (
        <div className="flex flex-col gap-1.5">
          <GroupLabel>Keyword-guess tiebreaker</GroupLabel>
          <p className="text-2xs text-fg-muted">
            Points are tied — who guessed more of the enemy keywords?
          </p>
          <div className="flex gap-2">
            {(
              [
                [0, "White won"],
                [1, "Black won"],
                ["shared", "Shared victory"],
              ] as const
            ).map(([tb, label]) => (
              <Chip
                key={String(tb)}
                pressed={value.decryptoTiebreak === tb}
                tone={tb === "shared" ? "amber" : "accent"}
                size="sm"
                onClick={() => commit({ tiebreak: tb })}
              >
                {label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <ResultLine derived={derived} />
    </OutcomeFormShell>
  );
}

function ResultLine({ derived }: { derived: ReturnType<typeof deriveDecryptoOutcome> }) {
  if (derived.status === "decided") {
    const winner =
      derived.winners.length === 2
        ? "Shared victory"
        : derived.winners[0] === 0
          ? "White wins"
          : "Black wins";
    const why = {
      interceptions: "two interceptions",
      miscommunications: "the enemy miscommunicated twice",
      points: "won the points tiebreak",
      tiebreak: "keyword-guess tiebreaker",
    }[derived.reason];
    return (
      <p className="text-xs font-semibold text-emerald-300">
        {winner} — {why} (round {derived.rounds}) · points {derived.points[0]} : {derived.points[1]}
      </p>
    );
  }
  if (derived.status === "invalid") {
    return <p className="text-xs font-semibold text-rose-300">{derived.reason}</p>;
  }
  if (derived.status === "needs-tiebreak") {
    return (
      <p className="text-xs font-semibold text-amber-300">
        Tied on points — answer the tiebreaker above.
      </p>
    );
  }
  return <p className="text-xs italic text-fg-muted">{derived.reason}</p>;
}

function flattenRoster(value: MatchOutcomeTeams): Slot[] {
  const flat: Slot[] = [];
  value.teams.forEach((team, i) => {
    for (const m of team.members) {
      flat.push({ userId: m.userId, displayName: m.displayName, side: i === 1 ? 1 : 0 });
    }
  });
  flat.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return flat;
}

function totalPoints(rounds: readonly DecryptoTokenRound[]): [number, number] {
  const points: [number, number] = [0, 0];
  for (const r of rounds) {
    for (const side of [0, 1] as const) {
      if (r.interception[side]) points[side] += 1;
      if (r.miscommunication[side]) points[side] -= 1;
    }
  }
  return points;
}
