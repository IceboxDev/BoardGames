import type { SetCardData } from "@boardgames/core/games/set/types";

// biome-ignore lint/style/useComponentExportOnlyModules: shared constant used by sibling components
export type { SetCardData };

export type CardColor = SetCardData["color"];
export type Shape = SetCardData["shape"];
export type Fill = SetCardData["fill"];
export type Count = SetCardData["count"];

const COLOR_MAP: Record<CardColor, string> = {
  red: "#e63946",
  green: "#2a9d8f",
  purple: "#7b2cbf",
};

const SHAPE_PATHS: Record<Shape, string> = {
  diamond: "M20,2 L38,30 L20,58 L2,30 Z",
  oval: "M20,4 C33,4 36,14 36,22 L36,38 C36,46 33,56 20,56 C7,56 4,46 4,38 L4,22 C4,14 7,4 20,4 Z",
  squiggle:
    "M20,2 C28,0 36,5 33,13 C30,21 29,27 28,30 C27,33 27,42 27,48 C27,54 24,58 20,58 C16,58 10,55 7,48 C4,41 10,33 12,30 C14,27 13,18 13,13 C13,6 16,2 20,2 Z",
};

function ShapeSVG({
  shape,
  color,
  fill,
  uid,
}: {
  shape: Shape;
  color: CardColor;
  fill: Fill;
  uid: string;
}) {
  const c = COLOR_MAP[color];
  const patternId = `stripes-${uid}`;

  const fillValue = fill === "solid" ? c : fill === "striped" ? `url(#${patternId})` : "none";

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 40 60"
      className="h-[70%] shrink-0 aspect-[2/3] overflow-visible"
    >
      {fill === "striped" && (
        <defs>
          <pattern id={patternId} patternUnits="userSpaceOnUse" width="40" height="5">
            <line x1="0" y1="2.5" x2="40" y2="2.5" stroke={c} strokeWidth="2" />
          </pattern>
        </defs>
      )}
      <path
        d={SHAPE_PATHS[shape]}
        fill={fillValue}
        stroke={c}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface SetCardProps {
  card: SetCardData;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  animate?: boolean;
  hinted?: boolean;
}

export default function SetCard({
  card,
  selected,
  onClick,
  disabled = false,
  animate = false,
  hinted = false,
}: SetCardProps) {
  const borderClass = selected
    ? "border-yellow-400 ring-2 ring-yellow-400 scale-[1.03]"
    : hinted
      ? "border-blue-400 ring-2 ring-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.5)]"
      : "border-gray-200";

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={[
        "h-full w-full flex flex-row items-center justify-center gap-2 rounded-xl border-2 bg-white px-2 py-1 shadow transition-all duration-300",
        borderClass,
        disabled ? "cursor-default opacity-70" : "hover:shadow-lg cursor-pointer",
        animate ? "animate-card-enter" : "",
      ].join(" ")}
    >
      {Array.from({ length: card.count }).map((_, i) => (
        <ShapeSVG
          // biome-ignore lint/suspicious/noArrayIndexKey: static list / chart data points don't reorder
          key={i}
          shape={card.shape}
          color={card.color}
          fill={card.fill}
          uid={`${card.id}-${i}`}
        />
      ))}
    </button>
  );
}
