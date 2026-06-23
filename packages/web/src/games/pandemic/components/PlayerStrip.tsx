import { getRoleDef } from "@boardgames/core/games/pandemic/roles";
import type { PlayerState } from "@boardgames/core/games/pandemic/types";
import RoleCard from "./RoleCard";

interface Props {
  players: PlayerState[];
  currentPlayerIndex: number;
}

/**
 * Left-side stack of role cards — one compact card per player, with a
 * white ring on the active player and a small hand-count badge in the
 * top-right corner. Replaces the canvas-era info-layer's roster panel.
 */
export default function PlayerStrip({ players, currentPlayerIndex }: Props) {
  return (
    <aside aria-label="Players" className="pointer-events-auto flex flex-col gap-1.5">
      {players.map((p) => {
        const role = getRoleDef(p.role);
        const isActive = p.id === currentPlayerIndex;
        return (
          <div key={p.id} className="relative">
            <RoleCard
              role={role}
              playerIndex={p.id}
              width={100}
              variant="compact"
              active={isActive}
            />
            <span
              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/80 text-3xs font-bold text-white"
              style={{ border: `1.5px solid ${role.pawnColor}` }}
              title={`${p.hand.length} cards`}
            >
              {p.hand.length}
            </span>
          </div>
        );
      })}
    </aside>
  );
}
