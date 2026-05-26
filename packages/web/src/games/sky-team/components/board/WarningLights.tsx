import type { SkyTeamPlayerView, SlotId } from "@boardgames/core/games/sky-team/types";
import { BoardOverlay } from "../../../../components/board";
import { WARNING_LIGHT_SIZE, WARNING_LIGHTS } from "./geometry";

interface Props {
  view: SkyTeamPlayerView;
}

// Each warning lamp corresponds to a mandatory slot — the lamp flashes while
// that slot is still empty, then disappears once a die has been committed.
// Order mirrors `WARNING_LIGHTS` in geometry: pilot-axis, copilot-axis,
// pilot-engine, copilot-engine.
const WARNING_SLOT_FOR_LIGHT: readonly SlotId[] = [
  "pilot-axis",
  "copilot-axis",
  "pilot-engine",
  "copilot-engine",
];

/**
 * Four flashing amber warning lamps — recessed dashboard indicators with the
 * classic yellow warning-triangle + exclamation glyph. Each lamp flashes
 * until a die is placed in its corresponding mandatory slot; the moment that
 * slot is filled the lamp is removed so the cockpit visually settles as the
 * round progresses.
 */
export default function WarningLights({ view }: Props) {
  return (
    <>
      {WARNING_LIGHTS.map((pos, i) => {
        const slot = WARNING_SLOT_FOR_LIGHT[i];
        if (slot && view.slots[slot]?.die != null) return null;
        return (
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
        );
      })}
    </>
  );
}
