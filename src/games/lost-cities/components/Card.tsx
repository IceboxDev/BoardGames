import desertPanorama from "../assets/cards/desert-panorama.png";
import himalayaPanorama from "../assets/cards/himalaya-panorama.png";
import rainforestPanorama from "../assets/cards/rainforest-panorama.png";
import underseaPanorama from "../assets/cards/undersea-panorama.png";
import volcanoPanorama from "../assets/cards/volcano-panorama.png";
import type { Card as CardData, ExpeditionColor } from "../logic/types";
import { COLOR_HEX } from "../logic/types";

const SIZE_CLASSES = {
  sm: "w-12 h-[4.5rem] text-xs",
  md: "w-16 h-24 text-sm",
  lg: "w-20 h-[7.5rem] text-base",
  hand: "w-full aspect-[2/3] text-sm",
} as const;

const PANORAMA_MAP: Record<ExpeditionColor, string> = {
  red: volcanoPanorama,
  green: rainforestPanorama,
  blue: underseaPanorama,
  white: himalayaPanorama,
  yellow: desertPanorama,
};

function getCardArtStyle(card: CardData): React.CSSProperties {
  const localIdx = card.id % 12;
  const col = localIdx % 6;
  const row = Math.floor(localIdx / 6);
  const xPct = (col / 5) * 100;
  const yPct = row * 100;

  return {
    backgroundImage: `url(${PANORAMA_MAP[card.color]})`,
    backgroundSize: "600% 200%",
    backgroundPosition: `${xPct}% ${yPct}%`,
  };
}

const BADGE_FONT: Record<string, string> = {
  sm: "text-[0.55rem]",
  md: "text-[0.65rem]",
  lg: "text-xs",
  hand: "text-[0.65rem]",
};

const WAGER_BADGE_FONT: Record<string, string> = {
  sm: "text-[0.4rem]",
  md: "text-[0.5rem]",
  lg: "text-[0.6rem]",
  hand: "text-[0.5rem]",
};

function WagerIcon({ color, size }: { color: string; size: string }) {
  const dim = size === "sm" ? "w-2.5 h-2.5" : size === "md" ? "w-3 h-3" : "w-3.5 h-3.5";
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={dim}
      fill="none"
      stroke={color}
      strokeWidth="3"
    >
      <path d="M7 11L12 4L17 11" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 17L12 10L17 17" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface CardProps {
  card: CardData;
  onClick?: () => void;
  disabled?: boolean;
  faceDown?: boolean;
  selected?: boolean;
  glowing?: boolean;
  size?: "sm" | "md" | "lg" | "hand";
  animate?: boolean;
}

export default function Card({
  card,
  onClick,
  disabled = false,
  faceDown = false,
  selected = false,
  glowing = false,
  size = "md",
  animate = false,
}: CardProps) {
  const hex = COLOR_HEX[card.color];

  if (faceDown) {
    return (
      <div
        className={`${SIZE_CLASSES[size]} rounded-lg border-2 border-gray-600 bg-gradient-to-br from-gray-700 to-gray-800 shadow-md flex items-center justify-center`}
      >
        <div className="w-3/4 h-3/4 rounded border border-gray-500 bg-gray-600 opacity-60" />
      </div>
    );
  }

  const borderClass = selected
    ? "ring-2 ring-yellow-400 border-yellow-400 scale-105"
    : glowing
      ? "ring-2 ring-cyan-400 border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.5)]"
      : "";

  const artStyle = getCardArtStyle(card);

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={[
        SIZE_CLASSES[size],
        "rounded-lg border-2 shadow-lg relative overflow-hidden transition-all duration-200",
        borderClass,
        disabled ? "cursor-default" : "hover:scale-105 cursor-pointer",
        animate ? "animate-card-enter" : "",
      ].join(" ")}
      style={{
        ...artStyle,
        borderColor: selected ? undefined : glowing ? undefined : `${hex}cc`,
      }}
    >
      {/* Dark gradient overlays for badge readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/40 pointer-events-none" />

      {/* Top-left badge */}
      <div
        className="absolute top-0 left-0 flex items-center gap-0.5 px-1 py-0.5 rounded-br-md"
        style={{ backgroundColor: `${hex}dd` }}
      >
        {card.type === "wager" ? (
          <WagerIcon color="#fff" size={size} />
        ) : (
          <span className={`font-extrabold text-white leading-none ${BADGE_FONT[size]}`}>
            {card.value}
          </span>
        )}
      </div>

      {/* Bottom-right badge */}
      <div
        className="absolute bottom-0 right-0 flex items-center gap-0.5 px-1 py-0.5 rounded-tl-md rotate-180"
        style={{ backgroundColor: `${hex}dd` }}
      >
        {card.type === "wager" ? (
          <WagerIcon color="#fff" size={size} />
        ) : (
          <span className={`font-extrabold text-white leading-none ${BADGE_FONT[size]}`}>
            {card.value}
          </span>
        )}
      </div>

      {/* Center value for larger sizes */}
      {size !== "sm" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {card.type === "wager" ? (
            <div className="flex flex-col items-center gap-0.5">
              <WagerIcon color="white" size="lg" />
              <span
                className={`font-bold tracking-wide text-white/90 drop-shadow-md ${WAGER_BADGE_FONT[size]}`}
              >
                WAGER
              </span>
            </div>
          ) : (
            <span
              className="font-extrabold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] leading-none"
              style={{
                fontSize: size === "md" ? "1.5rem" : size === "hand" ? "1.5rem" : "2rem",
              }}
            >
              {card.value}
            </span>
          )}
        </div>
      )}

      {/* Colored inner glow at edges */}
      <div
        className="absolute inset-0 pointer-events-none rounded-lg"
        style={{
          boxShadow: `inset 0 0 8px ${hex}40`,
        }}
      />
    </button>
  );
}

export function CardPlaceholder({
  color,
  size = "md",
  onClick,
  glowing = false,
  label,
}: {
  color: ExpeditionColor;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  glowing?: boolean;
  label?: string;
}) {
  const hex = COLOR_HEX[color];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={[
        SIZE_CLASSES[size],
        "rounded-lg border-2 border-dashed flex items-center justify-center transition-all duration-200",
        glowing
          ? "ring-2 ring-cyan-400 border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.5)] cursor-pointer"
          : onClick
            ? "hover:scale-105 cursor-pointer"
            : "cursor-default",
      ].join(" ")}
      style={{
        borderColor: glowing ? undefined : `${hex}40`,
        backgroundColor: `${hex}08`,
      }}
    >
      {label && (
        <span className="text-[0.5rem] font-medium opacity-40" style={{ color: hex }}>
          {label}
        </span>
      )}
    </button>
  );
}
