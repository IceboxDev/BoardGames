import { CITY_DATA } from "@boardgames/core/games/pandemic/city-graph";
import { getRoleDef } from "@boardgames/core/games/pandemic/roles";
import type { GameState } from "@boardgames/core/games/pandemic/types";
import { PORTRAIT_URLS } from "../board-assets";

const PHASE_LABELS: Record<GameState["phase"], string> = {
  setup: "Setup",
  actions: "Action Phase",
  draw: "Drawing Cards…",
  epidemic: "Epidemic!",
  infect: "Infecting Cities…",
  discard: "Discard to 7 cards",
  forecast: "Forecast — Reorder Cards",
  game_over: "Game Over",
};

interface Props {
  state: GameState;
}

/**
 * Top status strip — current player + role, current city, phase, turn
 * counter, every player's portrait with their hand count. Replaces the
 * canvas-era `info-layer.ts` top bar with plain HTML, so screen readers
 * can announce the active player and phase.
 */
export default function InfoBar({ state }: Props) {
  const player = state.players[state.currentPlayerIndex];
  const roleDef = getRoleDef(player.role);
  const cityName = CITY_DATA.get(player.location)?.name ?? player.location;
  const phaseColor = state.phase === "epidemic" ? "text-red-400" : "text-amber-300";

  return (
    <header className="pointer-events-auto flex items-center gap-3 rounded-lg border border-white/10 bg-black/80 px-3 py-2 text-xs text-white backdrop-blur-sm">
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-tight">
          Player {player.id + 1}: <span style={{ color: roleDef.pawnColor }}>{roleDef.name}</span>
        </p>
        <p className="text-2xs text-fg-secondary">in {cityName}</p>
      </div>

      <div className={`shrink-0 text-center font-bold uppercase tracking-wide ${phaseColor}`}>
        {PHASE_LABELS[state.phase] ?? state.phase}
      </div>

      <div className="flex shrink-0 items-center gap-3 text-2xs text-fg-secondary">
        <span>Turn {state.turnNumber}</span>
        <ul className="flex items-center gap-1.5">
          {state.players.map((p) => {
            const rd = getRoleDef(p.role);
            const isActive = p.id === state.currentPlayerIndex;
            return (
              <li
                key={p.id}
                className="flex flex-col items-center"
                title={`${rd.name} · ${p.hand.length} cards`}
              >
                <img
                  src={PORTRAIT_URLS[p.role]}
                  alt={rd.name}
                  className="h-7 w-7 rounded-full object-cover"
                  style={{
                    border: `${isActive ? 2.5 : 1.5}px solid ${
                      isActive ? "#ffffff" : rd.pawnColor
                    }`,
                  }}
                  draggable={false}
                />
                <span
                  className={`tabular-nums ${isActive ? "text-white" : "text-fg-muted"}`}
                  style={{ fontSize: 9, lineHeight: 1.2 }}
                >
                  {p.hand.length}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </header>
  );
}
