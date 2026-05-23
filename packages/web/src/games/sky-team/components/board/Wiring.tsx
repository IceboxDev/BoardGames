import {
  BRAKES_ORDER,
  FLAPS_ORDER,
  LANDING_GEAR_SLOTS,
} from "@boardgames/core/games/sky-team/scenarios";
import type { SlotId } from "@boardgames/core/games/sky-team/types";
import { BoardLayer } from "../../../../components/board";
import { ARTIFICIAL_HORIZON, ENGINE_ROW_AXIS_MARKER, SLOT_GEOMETRY } from "./geometry";

const TILE_TO_SLIDER_GAP = 4;
// Approx half-thickness of the navy outline (14cqi) around axis/engine slots,
// in viewBox units at the ~64–70px tile sizes — used to start wires just past
// the frame so they read as plugging into the slot edge.
const OUTLINE = 9;

const CABLE_EDGE = "#0e1115";
const CABLE_BODY = "#2c333d";
const CABLE_SHEEN = "rgb(190 205 215 / 0.5)";
const TERMINAL_RING = "#4a525b";
const TERMINAL_CORE = "#cdd6dc";

const SLIDER_SLOTS: readonly SlotId[] = [...LANDING_GEAR_SLOTS, ...FLAPS_ORDER, ...BRAKES_ORDER];

function Cable({ d, width }: { d: string; width: number }) {
  return (
    <>
      <path
        d={d}
        fill="none"
        stroke={CABLE_EDGE}
        strokeWidth={width + 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={d}
        fill="none"
        stroke={CABLE_BODY}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={d}
        fill="none"
        stroke={CABLE_SHEEN}
        strokeWidth={width * 0.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function Terminal({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <>
      <circle cx={x} cy={y} r={r} fill={TERMINAL_RING} />
      <circle cx={x} cy={y} r={r * 0.5} fill={TERMINAL_CORE} />
    </>
  );
}

/**
 * Decorative wiring harness — charcoal cables (dark edge + body + sheen) with
 * small metal terminals, routed so the controls read as "wired" to their
 * mechanisms:
 *   - each slider control (landing gear, flaps, brakes) → its slider
 *   - the two engines → each other (a slightly drooping cable)
 *   - each axis slot → the axis dial (a straight horizontal run)
 * Sits above the metal panel but behind the dial / arcs / slot overlays.
 */
export default function Wiring() {
  const { center, outerRadius } = ARTIFICIAL_HORIZON;

  // ---- tile → slider connectors ----
  const sliderWires = SLIDER_SLOTS.map((slot) => {
    const t = SLOT_GEOMETRY[slot];
    const cx = t.x + t.w / 2;
    const tileBottom = t.y + t.h;
    const sliderTop = tileBottom + TILE_TO_SLIDER_GAP;
    return { key: slot, cx, tileBottom, sliderTop };
  });

  // ---- engines → the central axis "+" (two straight runs flanking it) ----
  const pe = SLOT_GEOMETRY["pilot-engine"];
  const ce = SLOT_GEOMETRY["copilot-engine"];
  const engY = pe.y + pe.h / 2;
  const engLeft = pe.x + pe.w + OUTLINE; // just past pilot-engine's outer frame
  const engRight = ce.x - OUTLINE; // just past copilot-engine's outer frame
  const engMidGap = 16; // half-gap kept clear around the central "+" marker
  const engMidLeft = ENGINE_ROW_AXIS_MARKER.x - engMidGap;
  const engMidRight = ENGINE_ROW_AXIS_MARKER.x + engMidGap;

  // ---- axis slots → dial (horizontal) ----
  const pa = SLOT_GEOMETRY["pilot-axis"];
  const ca = SLOT_GEOMETRY["copilot-axis"];
  const axisY = pa.y + pa.h / 2;
  // Dial outer edge at axisY (half-chord of the bezel circle).
  const dialHalf = Math.sqrt(Math.max(0, outerRadius * outerRadius - (center.y - axisY) ** 2));
  const dialLeft = center.x - dialHalf;
  const dialRight = center.x + dialHalf;
  const pilotAxisInner = pa.x + pa.w + OUTLINE;
  const copilotAxisInner = ca.x - OUTLINE;

  return (
    <BoardLayer name="wiring" z={1} aria-hidden>
      {/* Slider connectors */}
      {sliderWires.map(({ key, cx, tileBottom, sliderTop }) => (
        <g key={key}>
          <Cable d={`M ${cx} ${tileBottom - 2} L ${cx} ${sliderTop + 2}`} width={3.5} />
          <Terminal x={cx} y={tileBottom} r={2.2} />
          <Terminal x={cx} y={sliderTop} r={2.2} />
        </g>
      ))}

      {/* Engines → central axis "+" (two straight runs) */}
      <Cable d={`M ${engLeft} ${engY} L ${engMidLeft} ${engY}`} width={4} />
      <Cable d={`M ${engMidRight} ${engY} L ${engRight} ${engY}`} width={4} />
      <Terminal x={engLeft} y={engY} r={3.2} />
      <Terminal x={engMidLeft} y={engY} r={3.2} />
      <Terminal x={engMidRight} y={engY} r={3.2} />
      <Terminal x={engRight} y={engY} r={3.2} />

      {/* Axis slots → dial */}
      <Cable d={`M ${pilotAxisInner} ${axisY} L ${dialLeft} ${axisY}`} width={4} />
      <Terminal x={pilotAxisInner} y={axisY} r={3.2} />
      <Terminal x={dialLeft} y={axisY} r={3.2} />

      <Cable d={`M ${copilotAxisInner} ${axisY} L ${dialRight} ${axisY}`} width={4} />
      <Terminal x={copilotAxisInner} y={axisY} r={3.2} />
      <Terminal x={dialRight} y={axisY} r={3.2} />
    </BoardLayer>
  );
}
