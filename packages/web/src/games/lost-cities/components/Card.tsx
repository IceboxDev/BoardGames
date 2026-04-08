import type { Card as CardData, ExpeditionColor } from "@boardgames/core/games/lost-cities/types";
import { COLOR_HEX } from "@boardgames/core/games/lost-cities/types";

const cardImages = import.meta.glob<{ default: string }>("../assets/cards/**/*.png", {
  eager: true,
});

function getCardImageUrl(card: CardData): string {
  const localIdx = card.id % 12;
  const filename = localIdx < 3 ? `wager-${localIdx + 1}` : `${card.value}`;
  const key = `../assets/cards/${card.color}/${filename}.png`;
  return cardImages[key]?.default ?? "";
}

const SIZE_CLASSES = {
  sm: "w-12 h-[4.5rem]",
  md: "w-16 h-24",
  lg: "w-20 h-[7.5rem]",
  hand: "w-full aspect-[2/3]",
} as const;

const HEADER_HEIGHT: Record<string, string> = {
  sm: "h-5",
  md: "h-7",
  lg: "h-9",
  hand: "h-7",
};

const NUMBER_FONT: Record<string, string> = {
  sm: "text-sm",
  md: "text-lg",
  lg: "text-xl",
  hand: "text-lg",
};

const ICON_DIM: Record<string, string> = {
  sm: "w-3 h-3",
  md: "w-4 h-4",
  lg: "w-5 h-5",
  hand: "w-4 h-4",
};

const WAGER_ICON_DIM: Record<string, string> = {
  sm: "w-3 h-3",
  md: "w-4 h-4",
  lg: "w-5 h-5",
  hand: "w-4 h-4",
};

const EMBOSS = "0 -1px 0 rgba(255,255,255,0.25), 0 1px 2px rgba(0,0,0,0.7)";

function ExpeditionIcon({ color, size }: { color: ExpeditionColor; size: string }) {
  const hex = COLOR_HEX[color];
  const dim = ICON_DIM[size];

  const paths: Record<ExpeditionColor, React.ReactNode> = {
    white: (
      <svg viewBox="0 0 24 24" className={dim} fill={hex} aria-hidden="true">
        <path d="M12 2L2 22h20L12 2zm0 5l6.5 13h-13L12 7z" />
        <path d="M12 2l5 10h-10L12 2z" />
      </svg>
    ),
    blue: (
      <svg viewBox="0 0 24 24" className={dim} fill={hex} aria-hidden="true">
        <path d="M12 2L9 9H3l5 4-2 7 6-4 6 4-2-7 5-4h-6L12 2z" />
      </svg>
    ),
    green: (
      <svg viewBox="0 0 24 24" className={dim} fill={hex} aria-hidden="true">
        <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66C7.72 17.12 9.45 13 17 11V8z" />
        <path d="M17 2c-3 0-6 2-8 5 2-1 4-1.5 6-1.5V2z" />
        <path d="M17 8c-3.5 0-6.5 2.5-8.5 6 2-.5 4-.5 6-.5V8z" />
      </svg>
    ),
    yellow: (
      <svg viewBox="0 0 24 24" className={dim} fill={hex} aria-hidden="true">
        <circle cx="12" cy="12" r="5" />
        <path
          d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"
          stroke={hex}
          strokeWidth="2"
          fill="none"
        />
      </svg>
    ),
    red: (
      <svg viewBox="0 0 24 24" className={dim} fill={hex} aria-hidden="true">
        <path d="M12 23c-1 0-8-5.5-8-12.8C4 5.7 7.6 1 12 1s8 4.7 8 9.2C20 17.5 13 23 12 23zm0-19c-3 0-5.5 3.5-5.5 7.2 0 5 4 8.8 5.5 9.8 1.5-1 5.5-4.8 5.5-9.8C17.5 7.5 15 4 12 4z" />
        <circle cx="12" cy="11" r="3" />
      </svg>
    ),
  };

  return <>{paths[color]}</>;
}

function WagerIcon({ color, size }: { color: string; size: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={WAGER_ICON_DIM[size]}
      fill="none"
      stroke={color}
      strokeWidth="3"
    >
      <path d="M7 11L12 4L17 11" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 17L12 10L17 17" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CornerBadge({ card, size, color }: { card: CardData; size: string; color: string }) {
  if (card.type === "wager") {
    return <WagerIcon color={color} size={size} />;
  }
  return (
    <span
      className={`leading-none ${NUMBER_FONT[size]}`}
      style={{
        color,
        fontFamily: "'Georgia', 'Palatino', 'Times New Roman', serif",
        fontWeight: 900,
        fontStyle: "italic",
        textShadow: EMBOSS,
      }}
    >
      {card.value}
    </span>
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
        className={`${SIZE_CLASSES[size]} rounded-md border-[3px] border-black bg-gradient-to-br from-gray-700 to-gray-800 shadow-md flex items-center justify-center`}
      >
        <div className="w-3/4 h-3/4 rounded border border-gray-500 bg-gray-600 opacity-60" />
      </div>
    );
  }

  const selectionRing = selected
    ? "ring-2 ring-yellow-400 scale-105"
    : glowing
      ? "ring-2 ring-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.5)]"
      : "";

  const artUrl = getCardImageUrl(card);

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={[
        SIZE_CLASSES[size],
        "rounded-md border-[3px] border-black shadow-lg relative overflow-hidden transition-all duration-200 flex flex-col",
        selectionRing,
        disabled ? "cursor-default" : "cursor-pointer",
        animate ? "animate-card-enter" : "",
      ].join(" ")}
    >
      <div
        className={`${HEADER_HEIGHT[size]} w-full flex items-center justify-between px-1.5 shrink-0 relative z-10 bg-black`}
      >
        <CornerBadge card={card} size={size} color={hex} />
        <ExpeditionIcon color={card.color} size={size} />
        <CornerBadge card={card} size={size} color={hex} />
      </div>

      <div className="flex-1 w-full relative min-h-0">
        {artUrl ? (
          <img
            src={artUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0" style={{ backgroundColor: `${hex}20` }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/30 pointer-events-none" />
      </div>
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
        "rounded-md border-[3px] border-dashed flex items-center justify-center transition-all duration-200",
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
