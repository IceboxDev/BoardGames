import { getRoleDef } from "@boardgames/core/games/pandemic/roles";
import type { PlayerState } from "@boardgames/core/games/pandemic/types";
import { PAWN_GAP, PAWN_OFFSET_Y, PAWN_RADIUS } from "./geometry";

interface Props {
  /** Players standing on this city, in player-id order. */
  players: PlayerState[];
  /** The currently-acting player, drawn with a white ring overlay. */
  currentPlayerIndex: number;
}

/**
 * Pawns at one city, fanned horizontally so up to four overlap cleanly. The
 * current player gets a brighter white ring so it's findable at a glance
 * even when several pawns share a city.
 *
 * Pawn color comes from the role definition — `Scientist`'s near-white
 * pawn forces a dark numeric label, every other role uses white.
 */
export default function PlayerPawns({ players, currentPlayerIndex }: Props) {
  if (players.length === 0) return null;

  const total = players.length;
  const step = PAWN_RADIUS * 2 + PAWN_GAP;
  // Center the row of pawns horizontally on x=0; offset above the cube stack.
  const startX = (-(total - 1) * step) / 2;

  return (
    <g>
      {players.map((p, idx) => {
        const roleDef = getRoleDef(p.role);
        const cx = startX + idx * step;
        const cy = PAWN_OFFSET_Y;
        const isCurrent = p.id === currentPlayerIndex;
        // Scientist's pawn is near-white; everyone else gets a light numeral.
        const numeralColor = p.role === "scientist" ? "#0a0a0a" : "#ffffff";
        return (
          <g key={p.id} aria-label={`Player ${p.id + 1}: ${roleDef.name}`}>
            <circle
              cx={cx}
              cy={cy}
              r={PAWN_RADIUS}
              fill={roleDef.pawnColor}
              stroke="#0a0a0a"
              strokeWidth={2}
            />
            {isCurrent && (
              <circle
                cx={cx}
                cy={cy}
                r={PAWN_RADIUS + 2}
                fill="none"
                stroke="#ffffff"
                strokeWidth={1.5}
                opacity={0.9}
              />
            )}
            <text
              x={cx}
              y={cy + 1}
              fill={numeralColor}
              fontSize={13}
              fontWeight={700}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {p.id + 1}
            </text>
          </g>
        );
      })}
    </g>
  );
}
