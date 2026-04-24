import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CardDeckProps {
  /** Number of cards remaining in the deck. */
  count: number;
  /** Render the card back artwork. Receives the card dimensions as className. */
  renderBack: (className: string) => ReactNode;
  /** Optional face-up top card (e.g. discard pile). When set, the topmost layer renders this instead of {@link renderBack}. */
  renderTop?: (className: string) => ReactNode;
  /** Optional trump card rendered face-up, rotated 90deg at the bottom of the deck. */
  trump?: {
    render: (className: string) => ReactNode;
  };
  /** Size preset. */
  size?: "sm" | "md" | "lg";
  /** Show a glow ring on the top card (e.g. when the deck is selectable). */
  glowing?: boolean;
  /** Click handler — makes the deck interactive. */
  onClick?: () => void;
}

const SIZES = {
  sm: { w: 56, h: 80, cls: "w-14 h-20", radius: "rounded-md" },
  md: { w: 80, h: 112, cls: "w-20 h-28", radius: "rounded-lg" },
  lg: { w: 96, h: 140, cls: "w-24 h-35", radius: "rounded-lg" },
};

// How many physical card layers to render for each count (1-5 are exact, 6+ get 6 layers)
function layerCount(count: number): number {
  if (count <= 0) return 0;
  if (count <= 5) return count;
  return 6;
}

// Slight random-looking rotation per layer for a natural stacked look
const LAYER_ROTATIONS = [0, -0.8, 0.5, -0.3, 0.7, -0.4];

// Stable keys for each layer (avoids array-index-as-key lint rule)
const LAYER_KEYS = ["l0", "l1", "l2", "l3", "l4", "l5"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CardDeck({
  count,
  renderBack,
  renderTop,
  trump,
  size = "md",
  glowing = false,
  onClick,
}: CardDeckProps) {
  const s = SIZES[size];

  // Face-down cards in the stack (trump accounts for one card when present)
  const stackCount = trump ? count - 1 : count;
  const layers = layerCount(stackCount);

  // Each layer gets a vertical offset (bottom to top)
  const offsetPx = size === "sm" ? 1.5 : 2;

  // Fixed trump position — identical whether peeking under the stack or shown alone.
  // Peeks to the left; the right edge sits 2px inside the deck boundary.
  const trumpTop = s.h / 2 - s.w / 2;
  const trumpLeft = s.w / 2 - s.h / 2 - 2;

  // Glow box-shadow applied to the top-most visible card
  const glowShadow = glowing ? ", 0 0 8px rgba(251,191,36,0.6), 0 0 20px rgba(251,191,36,0.3)" : "";
  const glowRing = glowing ? "ring-2 ring-amber-400/80" : "";
  const clickClass = onClick ? "cursor-pointer" : "";

  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`relative inline-flex flex-col items-center ${clickClass}`}
      style={{ minHeight: s.h + layers * offsetPx + 8 }}
    >
      {/* Trump card — fixed position, peeks left. Hidden under stack when layers > 0. */}
      {trump && count > 0 && (
        <div
          className="absolute"
          style={{
            top: trumpTop,
            left: trumpLeft,
            transform: "rotate(90deg)",
            zIndex: layers > 0 ? 0 : 5,
          }}
        >
          <div
            className={`${s.cls} overflow-hidden ${s.radius} shadow-md ${layers === 0 ? glowRing : ""}`}
            style={
              layers === 0 ? { boxShadow: `0 4px 6px rgba(0,0,0,0.4)${glowShadow}` } : undefined
            }
          >
            {trump.render(s.cls)}
          </div>
        </div>
      )}

      {/* Empty state */}
      {count === 0 && (
        <div
          className={`${s.cls} flex items-center justify-center ${s.radius} border-2 border-dashed border-gray-700/50`}
        >
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-600">
            Empty
          </span>
        </div>
      )}

      {/* Trump alone — spacer for container sizing + count badge */}
      {trump && count > 0 && layers === 0 && (
        <div className="relative" style={{ width: s.w, height: s.h }}>
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="flex h-8 min-w-8 items-center justify-center rounded-full bg-black/60 px-2 shadow-lg backdrop-blur-sm ring-1 ring-white/10">
              <span className="text-xs font-bold tabular-nums text-white">{count}</span>
            </div>
          </div>
        </div>
      )}

      {/* Card stack layers */}
      {layers > 0 && (
        <div className="relative z-10" style={{ width: s.w, height: s.h }}>
          {LAYER_KEYS.slice(0, layers).map((key, i) => {
            const isTop = i === layers - 1;
            const yOffset = (layers - 1 - i) * offsetPx;
            const rotation = LAYER_ROTATIONS[i] ?? 0;
            const shadowOpacity = isTop ? 0.4 : 0.1 + i * 0.05;
            const shadow = `0 ${1 + i}px ${2 + i * 2}px rgba(0,0,0,${shadowOpacity})${isTop ? glowShadow : ""}`;

            return (
              <div
                key={key}
                className={`absolute inset-0 ${s.radius} overflow-hidden ${isTop ? glowRing : ""}`}
                style={{
                  transform: `translateY(${yOffset}px) rotate(${rotation}deg)`,
                  zIndex: i,
                  boxShadow: shadow,
                }}
              >
                {isTop ? (
                  <div className="relative h-full w-full">
                    {(renderTop ?? renderBack)(`h-full w-full ${s.radius}`)}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent" />
                  </div>
                ) : (
                  <div className="h-full w-full border border-gray-600/60 bg-gradient-to-br from-gray-800 to-gray-900" />
                )}
              </div>
            );
          })}

          {/* Card count badge */}
          {count > 0 && (
            <div className="absolute z-20 flex items-center justify-center" style={{ inset: 0 }}>
              <div className="flex h-8 min-w-8 items-center justify-center rounded-full bg-black/60 px-2 shadow-lg backdrop-blur-sm ring-1 ring-white/10">
                <span className="text-xs font-bold tabular-nums text-white">{count}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </Wrapper>
  );
}
