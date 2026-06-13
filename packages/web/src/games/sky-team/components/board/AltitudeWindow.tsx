import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import { useReducedMotion } from "framer-motion";
import { useId } from "react";
import rerollDiceUrl from "../../assets/reroll-dice.svg";

interface Props {
  view: SkyTeamPlayerView;
}

// Drawn in the altitude HUD's native 240×88 box (see HUD_ALTITUDE).
const W = 240;
const H = 88;
const MID = H / 2;
/** Vertical px per 1,000 ft on the tape. */
const STEP = 26;
const K = STEP / 1000;

const PILOT_BLUE = "#38bdf8";
const COPILOT_ORANGE = "#f97316";

/**
 * Altimeter-tape readout for the top-right HUD slot. Three layers:
 *
 *   1. A scrolling tape of altitude rungs (major line + label per 1,000 ft,
 *      short minor tick per 500 ft) styled after the artificial horizon's
 *      pitch ladder. The tape eases downward as the plane descends so the
 *      current altitude always sits on the centre datum.
 *   2. Reroll markers riding the tape at every `rerollAt` altitude (Green /
 *      Yellow routes: 6,000 ft start + 2,000 ft) — lit while ahead, glowing
 *      when the plane is AT that altitude (token just refreshed), dimmed
 *      once passed.
 *   3. Static chrome: centre datum marks, the big current-altitude readout
 *      (amber on the final approach), and a corner arrow showing who places
 *      first this round — blue pointing left for the pilot, orange pointing
 *      right for the co-pilot, mirroring their sides of the cockpit.
 */
export default function AltitudeWindow({ view }: Props) {
  const reduceMotion = useReducedMotion();
  const clipId = useId();
  const { feet, rerollAt } = view.altitude;
  const top = view.scenario.altitudeStart;
  const pilotStarts = view.firstThisRound === 0;

  // Rung positions are static (laid out for `top`); the whole tape group
  // translates so the current altitude lands on the centre datum.
  const yStatic = (alt: number) => MID + (top - alt) * K;
  const tapeShift = (feet - top) * K;

  const majors: number[] = [];
  for (let alt = top; alt >= 0; alt -= 1000) majors.push(alt);
  const minors: number[] = [];
  for (let alt = top - 500; alt >= 0; alt -= 1000) minors.push(alt);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={W} height={H} />
        </clipPath>
      </defs>

      {/* ── Scrolling tape ─────────────────────────────────────────── */}
      <g clipPath={`url(#${clipId})`}>
        <g
          style={{
            transform: `translateY(${tapeShift}px)`,
            transition: reduceMotion ? undefined : "transform 0.9s cubic-bezier(0.45, 0, 0.55, 1)",
          }}
        >
          {/* Major rungs — one per 1,000 ft, label on the left ladder. */}
          <g stroke="rgb(255 255 255 / 0.55)">
            {majors.map((alt) => (
              <g key={`major-${alt}`}>
                <line
                  x1={10}
                  y1={yStatic(alt)}
                  x2={38}
                  y2={yStatic(alt)}
                  strokeWidth={1.5}
                  opacity={0.7}
                />
                <line
                  x1={202}
                  y1={yStatic(alt)}
                  x2={230}
                  y2={yStatic(alt)}
                  strokeWidth={1.5}
                  opacity={0.7}
                />
              </g>
            ))}
            {/* Minor rungs — shorter edge ticks per 500 ft. */}
            {minors.map((alt) => (
              <g key={`minor-${alt}`}>
                <line
                  x1={10}
                  y1={yStatic(alt)}
                  x2={24}
                  y2={yStatic(alt)}
                  strokeWidth={1}
                  opacity={0.4}
                />
                <line
                  x1={216}
                  y1={yStatic(alt)}
                  x2={230}
                  y2={yStatic(alt)}
                  strokeWidth={1}
                  opacity={0.4}
                />
              </g>
            ))}
          </g>
          {/* Rung labels (thousands of feet) beside the left ladder. */}
          {majors.map((alt) => (
            <text
              key={`label-${alt}`}
              x={42}
              y={yStatic(alt)}
              dominantBaseline="central"
              fontSize={8}
              fontWeight={700}
              fill="rgb(226 239 242 / 0.55)"
              letterSpacing={0.5}
            >
              {alt / 1000}K
            </text>
          ))}

          {/* Reroll markers — `rerollAt` altitudes refresh the reroll supply. */}
          {rerollAt.map((alt) => {
            const current = feet === alt;
            const passed = feet < alt;
            return (
              <g
                key={`reroll-${alt}`}
                transform={`translate(190, ${yStatic(alt)})`}
                opacity={passed ? 0.3 : 1}
                style={
                  current ? { filter: "drop-shadow(0 0 5px rgba(52, 211, 153, 0.9))" } : undefined
                }
              >
                <circle
                  r={8.5}
                  fill="rgb(6 78 59 / 0.55)"
                  stroke={current ? "#34d399" : "rgb(52 211 153 / 0.55)"}
                  strokeWidth={current ? 1.6 : 1.1}
                />
                <image href={rerollDiceUrl} x={-5.5} y={-5.5} width={11} height={11} />
              </g>
            );
          })}
        </g>
      </g>

      {/* ── Static chrome on top of the tape ───────────────────────── */}
      {/* Centre datum — the "you are here" witness marks. */}
      <g stroke="rgb(255 255 255 / 0.85)">
        <line x1={4} y1={MID} x2={14} y2={MID} strokeWidth={2} />
        <line x1={226} y1={MID} x2={236} y2={MID} strokeWidth={2} />
      </g>

      {/* Current altitude — amber once the final approach begins. */}
      <text
        x={W / 2}
        y={MID}
        dominantBaseline="central"
        textAnchor="middle"
        fontSize={21}
        fontWeight={900}
        letterSpacing={2}
        fill={view.isFinalRound ? "#fbbf24" : "#e6eff2"}
        style={{ filter: "drop-shadow(0 2px 3px rgba(0, 0, 0, 0.6))" }}
      >
        {feet}
      </text>

      {/* Round-starter arrows — blue ◄ bottom-left when the pilot places
          first, orange ► bottom-right for the co-pilot. The inactive side
          stays faintly visible so the indicator reads as a two-state lamp. */}
      <g
        opacity={pilotStarts ? 1 : 0.15}
        style={pilotStarts ? { filter: "drop-shadow(0 0 4px rgba(56, 189, 248, 0.8))" } : undefined}
      >
        <polygon points={`19,${H - 18} 7,${H - 10} 19,${H - 2}`} fill={PILOT_BLUE} />
      </g>
      <g
        opacity={pilotStarts ? 0.15 : 1}
        style={pilotStarts ? undefined : { filter: "drop-shadow(0 0 4px rgba(249, 115, 22, 0.8))" }}
      >
        <polygon
          points={`${W - 19},${H - 18} ${W - 7},${H - 10} ${W - 19},${H - 2}`}
          fill={COPILOT_ORANGE}
        />
      </g>
    </svg>
  );
}
