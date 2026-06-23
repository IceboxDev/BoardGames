import type { MatchOutcomeLastStanding, Participant } from "@boardgames/core/history/types";
import { useEffect } from "react";
import { heroesForSets } from "../../../games/dungeon-mayhem/characters";
import { parseMultiVariant } from "../../../games/match-variants";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { Field } from "../../ui/Field";
import { Surface } from "../../ui/Surface";
import { ParticipantPicker } from "../ParticipantPicker";
import { PlayerRow } from "../PlayerRow";

type User = { id: string; name: string };
type LsPlayer = MatchOutcomeLastStanding["players"][number];

type Props = {
  users: User[];
  value: MatchOutcomeLastStanding;
  onChange: (next: MatchOutcomeLastStanding) => void;
};

/**
 * Match-history form for Dungeon Mayhem — an elimination game (last hero
 * standing wins). Combines the last-standing elimination model (each player
 * eliminated in order; survivor wins) with a Villainous-style per-player hero
 * picker. The sets in play (picked in the GameVariantPicker above and stored in
 * `scenario` as e.g. "Standard + Monster Madness") decide which heroes are
 * offered — see `dungeon-mayhem/characters.ts`.
 */
export function DungeonMayhemForm({ users, value, onChange }: Props) {
  const selectedIds = value.players.map((p) => p.userId);
  const roster = heroesForSets(parseMultiVariant(value.scenario));

  // When the selected sets narrow (e.g. unchecking Monster Madness), clear any
  // hero that's no longer in the pool so a saved record never references a hero
  // outside its sets. Guarded so it only writes when something is actually
  // stale — no loop.
  useEffect(() => {
    const valid = new Set(heroesForSets(parseMultiVariant(value.scenario)));
    if (!value.players.some((p) => p.role !== undefined && !valid.has(p.role))) return;
    onChange({
      ...value,
      players: value.players.map((p) =>
        p.role !== undefined && !valid.has(p.role) ? withRole(p, undefined) : p,
      ),
    });
  }, [value, onChange]);

  function setParticipants(participants: Participant[]) {
    const byId = new Map(value.players.map((p) => [p.userId, p] as const));
    // Keep hero/elimination state for players who stay; new ones start clean.
    const players = participants.map((p) => {
      const prev = byId.get(p.userId);
      return prev ? { ...prev, ...p } : p;
    });
    onChange({ ...value, players });
  }

  function setHero(userId: string, hero: string) {
    const players = value.players.map((p) =>
      p.userId === userId ? withRole(p, p.role === hero ? undefined : hero) : p,
    );
    onChange({ ...value, players });
  }

  function toggleEliminated(userId: string) {
    const player = value.players.find((p) => p.userId === userId);
    if (!player) return;
    if (player.eliminationOrder !== undefined) {
      // Revive: drop the elimination order so this player counts as a survivor.
      const players = value.players.map((p) => (p.userId === userId ? withElim(p, undefined) : p));
      onChange({ ...value, players });
    } else {
      // Eliminate: append to the elimination order.
      const usedOrders = value.players
        .map((p) => p.eliminationOrder)
        .filter((o): o is number => o !== undefined);
      const nextOrder = usedOrders.length === 0 ? 0 : Math.max(...usedOrders) + 1;
      const players = value.players.map((p) => (p.userId === userId ? withElim(p, nextOrder) : p));
      onChange({ ...value, players });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Players" htmlFor="dm-players">
        <ParticipantPicker users={users} selectedIds={selectedIds} onChange={setParticipants} />
      </Field>

      {value.players.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-fg-secondary">
            Tap each player's hero, then eliminate them in order. Whoever's left standing wins.
          </span>
          {value.players.map((p) => {
            const eliminated = p.eliminationOrder !== undefined;
            return (
              <Surface key={p.userId} variant="tile" padding="sm" className="flex flex-col gap-1.5">
                <PlayerRow
                  name={p.displayName}
                  nameClassName={eliminated ? "text-fg-muted line-through" : "text-amber-100"}
                  right={
                    <>
                      {eliminated ? (
                        <span className="text-xs text-fg-muted">
                          out #{(p.eliminationOrder ?? 0) + 1}
                        </span>
                      ) : (
                        <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wide text-amber-200">
                          Surviving
                        </span>
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
                <div className="flex flex-wrap gap-1.5">
                  {roster.map((hero) => (
                    <Chip
                      key={hero}
                      pressed={p.role === hero}
                      tone="accent"
                      variant="outlined"
                      size="xs"
                      onClick={() => setHero(p.userId, hero)}
                    >
                      {hero}
                    </Chip>
                  ))}
                </div>
              </Surface>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────
// Set or clear the optional `role` / `eliminationOrder` keys without leaving
// `undefined` values on the wire object (the schema and MatchCard both key off
// presence).

function withRole(p: LsPlayer, role: string | undefined): LsPlayer {
  if (role === undefined) {
    const { role: _drop, ...rest } = p;
    return rest;
  }
  return { ...p, role };
}

function withElim(p: LsPlayer, eliminationOrder: number | undefined): LsPlayer {
  if (eliminationOrder === undefined) {
    const { eliminationOrder: _drop, ...rest } = p;
    return rest;
  }
  return { ...p, eliminationOrder };
}
