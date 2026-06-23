import type { DiseaseColor, GameState } from "@boardgames/core/games/pandemic/types";
import { DISEASE_COLORS, INFECTION_RATE_TRACK } from "@boardgames/core/games/pandemic/types";
import { DISEASE_FILL } from "../colors";

interface Props {
  state: GameState;
}

/**
 * Bottom-left status panel. Three stacked rows:
 *   1. Infection-rate track (7 cells, active one highlighted).
 *   2. Outbreak track (9 cells, gets redder as more outbreaks occur — 8 is loss).
 *   3. Disease cure status + remaining cubes in supply.
 *
 * Pure presentation; reads everything off `state`. Plain HTML so the
 * numbers stay sharp at any zoom.
 */
export default function TrackPanel({ state }: Props) {
  return (
    <section
      aria-label="Pandemic tracks"
      className="pointer-events-auto flex flex-col gap-2 rounded-lg border border-white/10 bg-black/80 p-2 text-white backdrop-blur-sm"
    >
      <div>
        <p className="mb-1 text-3xs font-semibold uppercase tracking-wide text-fg-secondary">
          Infection rate
        </p>
        <ul className="flex gap-0.5">
          {INFECTION_RATE_TRACK.map((rate, i) => {
            const isActive = i === state.infectionRateIndex;
            return (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: track index is the identity
                key={i}
                className={`flex h-6 w-6 items-center justify-center rounded text-2xs font-semibold tabular-nums ${
                  isActive
                    ? "border border-white bg-red-500 text-white"
                    : "border border-white/20 text-fg-secondary"
                }`}
              >
                {rate}
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <p className="mb-1 text-3xs font-semibold uppercase tracking-wide text-fg-secondary">
          Outbreaks: <span className="text-white">{state.outbreakCount}</span>/8
        </p>
        <ul className="flex gap-0.5">
          {Array.from({ length: 9 }, (_, i) => {
            const isActive = i === state.outbreakCount;
            const isPast = i < state.outbreakCount;
            const red = Math.min(255, 80 + i * 20);
            const bg = isActive
              ? `rgb(${red}, 40, 40)`
              : isPast
                ? `rgba(${red}, 40, 40, 0.55)`
                : "transparent";
            return (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: track index is the identity
                key={i}
                className={`flex h-6 w-6 items-center justify-center rounded text-2xs font-semibold tabular-nums ${
                  isActive
                    ? "border border-white text-white"
                    : "border border-white/15 text-fg-muted"
                }`}
                style={{ backgroundColor: bg }}
              >
                {i}
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <p className="mb-1 text-3xs font-semibold uppercase tracking-wide text-fg-secondary">
          Diseases
        </p>
        <ul className="flex gap-3">
          {DISEASE_COLORS.map((color) => (
            <DiseaseStatus
              key={color}
              color={color}
              status={state.diseaseStatus[color]}
              supply={state.diseaseCubeSupply[color]}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

interface DiseaseStatusProps {
  color: DiseaseColor;
  status: GameState["diseaseStatus"][DiseaseColor];
  supply: number;
}

function DiseaseStatus({ color, status, supply }: DiseaseStatusProps) {
  return (
    <li className="flex flex-col items-center gap-0.5">
      <span
        className="relative flex h-4 w-4 items-center justify-center rounded-full"
        style={{ backgroundColor: DISEASE_FILL[color] }}
      >
        {status === "cured" && <CheckMark color="#ffffff" />}
        {status === "eradicated" && (
          <>
            <CheckMark color="#10b981" />
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full"
              style={{ boxShadow: "0 0 0 1.5px #10b981 inset" }}
            />
          </>
        )}
      </span>
      <span className="text-3xs tabular-nums text-fg-secondary">{supply}</span>
    </li>
  );
}

function CheckMark({ color }: { color: string }) {
  // Tiny inline SVG check — sits inside the colored dot to indicate cured /
  // eradicated. Sized so the parent's 16×16 dot still reads as the disease
  // marker first, the cure state second.
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
      <path
        d="M3 8 L7 12 L13 4"
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
