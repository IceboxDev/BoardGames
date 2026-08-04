import type { MatchOutcomeLastStanding, Participant } from "@boardgames/core/history/types";
import { Button } from "../../ui/Button";
import { PlayerRow } from "../PlayerRow";
import { GroupLabel, nextEliminationOrder, OutcomeFormShell, SurvivalBadge } from "./shared";

type User = { id: string; name: string };

type LastStandingPlayer = MatchOutcomeLastStanding["players"][number];

type Props = {
  users: User[];
  value: MatchOutcomeLastStanding;
  onChange: (next: MatchOutcomeLastStanding) => void;
  gameSlug?: string | null;
};

// Survivors in chip-standing order: explicitly ranked first (1 = most chips),
// unranked after in list order.
function sortedSurvivorIds(players: LastStandingPlayer[]): string[] {
  return players
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.eliminationOrder === undefined)
    .sort(
      (a, b) =>
        (a.p.survivorRank ?? Number.POSITIVE_INFINITY) -
          (b.p.survivorRank ?? Number.POSITIVE_INFINITY) || a.i - b.i,
    )
    .map(({ p }) => p.userId);
}

// Once any survivor carries a rank, keep the set contiguous (1..n) so an
// eliminate/revive/roster change can't leave gaps or a rank on a lone survivor.
function recompactRanks(players: LastStandingPlayer[]): LastStandingPlayer[] {
  const ranked = players.filter((p) => p.survivorRank !== undefined);
  if (ranked.length === 0) return players;
  const survivorIds = sortedSurvivorIds(players);
  if (survivorIds.length < 2) {
    return players.map(({ survivorRank: _drop, ...p }) => p);
  }
  const rankById = new Map(survivorIds.map((id, i) => [id, i + 1] as const));
  return players.map(({ survivorRank: _drop, ...p }) => {
    const rank = rankById.get(p.userId);
    return rank === undefined ? p : { ...p, survivorRank: rank };
  });
}

function ordinal(n: number): string {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}

export function LastStandingForm({ users, value, onChange, gameSlug }: Props) {
  const selectedIds = value.players.map((p) => p.userId);
  // Poker nights can end with several players still holding chips — let the
  // admin order those survivors by final chip count.
  const chipOrdering = gameSlug === "poker";
  const survivorOrder = sortedSurvivorIds(value.players);

  function setParticipants(participants: Participant[]) {
    const prevById = new Map(value.players.map((p) => [p.userId, p] as const));
    const players = participants.map((p) => {
      const prev = prevById.get(p.userId);
      return {
        ...p,
        ...(prev?.eliminationOrder !== undefined
          ? { eliminationOrder: prev.eliminationOrder }
          : {}),
        ...(prev?.survivorRank !== undefined ? { survivorRank: prev.survivorRank } : {}),
      };
    });
    onChange({ ...value, players: recompactRanks(players) });
  }

  function toggleEliminated(userId: string) {
    const player = value.players.find((p) => p.userId === userId);
    if (!player) return;
    if (player.eliminationOrder !== undefined) {
      // Revive: drop the elimination order so this player counts as a survivor.
      const players = value.players.map((p) =>
        p.userId === userId ? { userId: p.userId, displayName: p.displayName } : p,
      );
      onChange({ ...value, players: recompactRanks(players) });
    } else {
      // Eliminate: append to the elimination order; a chip standing no longer
      // applies to a player who busted out.
      const nextOrder = nextEliminationOrder(value.players);
      const players = value.players.map(({ survivorRank, ...p }) =>
        p.userId === userId
          ? { ...p, eliminationOrder: nextOrder }
          : { ...p, ...(survivorRank !== undefined ? { survivorRank } : {}) },
      );
      onChange({ ...value, players: recompactRanks(players) });
    }
  }

  // Move a survivor one step up/down the chip standings. The first move
  // materialises explicit ranks for every survivor (in current list order).
  function moveSurvivor(userId: string, delta: -1 | 1) {
    const ids = [...survivorOrder];
    const from = ids.indexOf(userId);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    const rankById = new Map(ids.map((id, i) => [id, i + 1] as const));
    const players = value.players.map(({ survivorRank: _drop, ...p }) => {
      const rank = rankById.get(p.userId);
      return rank === undefined ? p : { ...p, survivorRank: rank };
    });
    onChange({ ...value, players });
  }

  return (
    <OutcomeFormShell users={users} selectedIds={selectedIds} onParticipants={setParticipants}>
      {value.players.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <GroupLabel>Eliminate each player in order. Whoever's left standing wins.</GroupLabel>
          {chipOrdering && survivorOrder.length > 1 && (
            <span className="text-xs text-fg-muted">
              Use ↑/↓ to order the players still holding chips — 1st ended the night with the most.
            </span>
          )}
          {value.players.map((p) => {
            const eliminated = p.eliminationOrder !== undefined;
            const standing = survivorOrder.indexOf(p.userId);
            const showChipControls = chipOrdering && !eliminated && survivorOrder.length > 1;
            return (
              <PlayerRow
                key={p.userId}
                name={p.displayName}
                nameClassName={eliminated ? "text-fg-muted line-through" : "text-amber-100"}
                right={
                  <>
                    <SurvivalBadge
                      eliminationOrder={p.eliminationOrder}
                      label={
                        showChipControls && p.survivorRank !== undefined
                          ? `${ordinal(p.survivorRank)} in chips`
                          : undefined
                      }
                    />
                    {showChipControls && (
                      <>
                        <Button
                          variant="secondary"
                          size="xs"
                          disabled={standing <= 0}
                          aria-label={`Move ${p.displayName} up the chip standings`}
                          onClick={() => moveSurvivor(p.userId, -1)}
                        >
                          ↑
                        </Button>
                        <Button
                          variant="secondary"
                          size="xs"
                          disabled={standing === survivorOrder.length - 1}
                          aria-label={`Move ${p.displayName} down the chip standings`}
                          onClick={() => moveSurvivor(p.userId, 1)}
                        >
                          ↓
                        </Button>
                      </>
                    )}
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => toggleEliminated(p.userId)}
                    >
                      {eliminated ? "Revive" : "Eliminate"}
                    </Button>
                  </>
                }
              />
            );
          })}
        </div>
      )}
    </OutcomeFormShell>
  );
}
