import { BoardOverlay } from "../../../../components/board";
import { WARNING_LIGHT_SIZE, WARNING_LIGHTS } from "./geometry";

/**
 * Four flashing amber warning lamps — recessed dashboard indicators with the
 * classic yellow warning-triangle + exclamation glyph. Placement (below the
 * axis slots, outside the engine slots) comes from `WARNING_LIGHTS`; the glow
 * + flash animation lives in `cockpit.css` (`.cockpit-warning`).
 */
export default function WarningLights() {
  return (
    <>
      {WARNING_LIGHTS.map((pos) => (
        <BoardOverlay
          key={`warn-${pos.x}-${pos.y}`}
          className="cockpit-warning-shell"
          at={pos}
          anchor="center"
          width={WARNING_LIGHT_SIZE}
          height={WARNING_LIGHT_SIZE}
        >
          <div className="cockpit-warning" role="img" aria-label="Warning indicator">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              {/* Rounded warning triangle — fills most of the box. */}
              <path
                d="M 50 10 L 90 86 L 10 86 Z"
                fill="#ffd21a"
                stroke="#1a1206"
                strokeWidth={7}
                strokeLinejoin="round"
              />
              {/* Small exclamation mark in the lower-centre. */}
              <rect x={46.5} y={42} width={7} height={16} rx={3} fill="#1a1206" />
              <circle cx={50} cy={67} r={4} fill="#1a1206" />
            </svg>
          </div>
        </BoardOverlay>
      ))}
    </>
  );
}
