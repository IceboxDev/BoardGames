import type { WonderId } from "@boardgames/core/games/7-wonders/types";
import { getWonderDef } from "@boardgames/core/games/7-wonders/wonders";
import { cn } from "../../../lib/cn";
import { crestArt } from "../logic/art";
import { wonderStyle } from "../logic/wonder-style";

interface Props {
  wonderId: WonderId;
  side: "A" | "B";
  stagesBuilt: number;
  /** Size classes, e.g. `h-14 w-14`. */
  className?: string;
  /** Greyed — this seat has nothing left to do. */
  dim?: boolean;
}

const R = 46;
const GAP = 0.14; // radians between segments

/**
 * A wonder at a glance: its painted crest (the drawn silhouette over its
 * palette until one exists), ringed by one arc per stage — gold once built. The stage count reads at
 * any size, which is what the navigator and the table need.
 */
export default function WonderMedallion({
  wonderId,
  side,
  stagesBuilt,
  className,
  dim = false,
}: Props) {
  const style = wonderStyle(wonderId);
  const stages = getWonderDef(wonderId).sides[side].stages.length;
  const span = (Math.PI * 2) / stages;
  const crest = crestArt(wonderId);

  return (
    <span
      className={cn(
        "relative inline-block shrink-0 transition-[filter,opacity]",
        dim && "opacity-70 saturate-50",
        className,
      )}
      title={`${getWonderDef(wonderId).name} (${side}) — ${stagesBuilt}/${stages} stages`}
    >
      {crest && (
        <img
          src={crest}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-[10%] h-[80%] w-[80%] select-none rounded-full object-contain drop-shadow-md"
        />
      )}
      <svg
        viewBox="0 0 100 100"
        className="relative h-full w-full drop-shadow-md"
        aria-hidden="true"
      >
        {!crest && (
          <>
            <defs>
              <radialGradient id={`wm-${wonderId}`} cx="35%" cy="25%" r="85%">
                <stop offset="0%" stopColor={style.from} />
                <stop offset="100%" stopColor={style.to} />
              </radialGradient>
              <clipPath id={`wm-clip-${wonderId}`}>
                <circle cx="50" cy="50" r="39" />
              </clipPath>
            </defs>
            <circle cx="50" cy="50" r="39" fill={`url(#wm-${wonderId})`} />
            <g clipPath={`url(#wm-clip-${wonderId})`}>
              <path
                d={style.silhouette}
                transform="translate(14 44) scale(0.72 0.72)"
                fill={style.accent}
                fillOpacity="0.85"
                stroke={style.accent}
                strokeOpacity="0.5"
                strokeWidth="1.2"
              />
            </g>
            <circle cx="50" cy="50" r="39" fill="none" stroke="#000" strokeOpacity="0.45" />
          </>
        )}
        {Array.from({ length: stages }, (_, i) => {
          const a0 = -Math.PI / 2 + i * span + GAP / 2;
          const a1 = a0 + span - GAP;
          const built = i < stagesBuilt;
          return (
            <path
              // biome-ignore lint/suspicious/noArrayIndexKey: one arc per stage, fixed order
              key={i}
              d={arc(a0, a1)}
              fill="none"
              strokeLinecap="round"
              strokeWidth={built ? 7 : 5}
              stroke={built ? "#f5c451" : "rgb(255 255 255 / 0.16)"}
              style={built ? { filter: "drop-shadow(0 0 3px rgb(245 196 81 / 0.7))" } : undefined}
            />
          );
        })}
      </svg>
    </span>
  );
}

function arc(a0: number, a1: number): string {
  const p = (a: number) =>
    `${(50 + R * Math.cos(a)).toFixed(2)} ${(50 + R * Math.sin(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(a0)} A${R} ${R} 0 ${large} 1 ${p(a1)}`;
}
