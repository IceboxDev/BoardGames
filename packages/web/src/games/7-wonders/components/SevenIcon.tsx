import type { ResourceType, ScienceSymbol } from "@boardgames/core/games/7-wonders/types";
import type { ReactNode } from "react";
import { cn } from "../../../lib/cn";
import type { ScoreCategory } from "../card-utils";
import { artUrl } from "../logic/art";

/**
 * 7 Wonders' iconography: the seven goods, coins, shields, the three
 * sciences, laurels (VP), the conflict tokens and the game's symbols. Each
 * is the painted icon from ART-PROMPTS.md, matching the round icons printed
 * on the cards; the inline SVG set is the fallback for any not generated.
 * Each icon carries its own colours (a resource is recognised by its colour
 * first), so it reads the same on every surface; size it by class.
 */
export type SevenIconName =
  | ResourceType
  | ScienceSymbol
  | "coin"
  | "shield"
  | "laurel"
  | "victory"
  | "defeat"
  | "discard"
  | "pawn"
  | "chain"
  | "wonder"
  | "swords"
  | "cards"
  | "trade"
  | "science-any"
  | "edifice";

const GEAR = gearPath(12, 12, 9.5, 7, 8);

function gearPath(cx: number, cy: number, outer: number, inner: number, teeth: number): string {
  const pts: string[] = [];
  const step = (Math.PI * 2) / (teeth * 4);
  for (let i = 0; i < teeth * 4; i++) {
    const r = i % 4 < 2 ? outer : inner;
    const a = i * step - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

const ICONS: Partial<Record<SevenIconName, ReactNode>> = {
  wood: (
    <>
      <rect x="2" y="7" width="17" height="10" rx="5" fill="#8a5a2b" />
      <path d="M5 10.5h8M6 13.5h9" stroke="#5e3b19" strokeWidth="1" strokeLinecap="round" />
      <ellipse cx="18" cy="12" rx="4" ry="5" fill="#e0b47a" stroke="#6b4320" strokeWidth="1" />
      <ellipse cx="18" cy="12" rx="1.8" ry="2.4" fill="none" stroke="#a87443" strokeWidth="0.9" />
    </>
  ),
  stone: (
    <>
      <path d="M3 17 6.5 8.5 12.5 5l6.5 3.5L21.5 16 16 20.5H7.5Z" fill="#a3acb4" stroke="#545c64" />
      <path d="M12.5 5 11 12l-4.5 4.5M11 12l8.5 3.5" stroke="#6f7880" strokeWidth="1" fill="none" />
      <path d="M8 9l2.5-1.5" stroke="#dfe5ea" strokeWidth="1.2" strokeLinecap="round" />
    </>
  ),
  clay: (
    <>
      <path d="M3 9.5 8 6h13l-5 3.5Z" fill="#e08a5a" />
      <path d="M3 9.5h13v8.5H3Z" fill="#c4673a" />
      <path d="M16 9.5 21 6v8.5L16 18Z" fill="#9a4a25" />
      <path d="M3 13.75h13M9.5 9.5v4.25" stroke="#8c3f1d" strokeWidth="0.9" />
    </>
  ),
  ore: (
    <>
      <path d="M2.5 17.5 6 9l6-3.5 6.5 2.5 3 9.5-6 3H8Z" fill="#3d4652" stroke="#1f252c" />
      <path d="M8 11.5l3-1.5 1.5 2.5-2.5 2Z" fill="#c9d4df" />
      <path d="M14 14.5l2.5-1 1 2-2.5 1.2Z" fill="#9fb0c0" />
      <path d="M12.5 7.5l2-.5.6 1.6-2 .6Z" fill="#dbe4ec" />
    </>
  ),
  glass: (
    <>
      <path
        d="M9.5 3h5v3.5c0 1 3.5 2.5 3.5 7 0 4.5-2.5 7.5-6 7.5s-6-3-6-7.5c0-4.5 3.5-6 3.5-7Z"
        fill="#5ec7d9"
        fillOpacity="0.85"
        stroke="#1f7f91"
      />
      <path d="M9 12.5c-.5 2 0 4 1.5 5" stroke="#d8f6fb" strokeWidth="1.3" fill="none" />
      <rect x="9" y="2" width="6" height="2" rx="1" fill="#1f7f91" />
    </>
  ),
  loom: (
    <>
      <path d="M4 6h13a3 3 0 0 1 0 6H4Z" fill="#9b6bd6" />
      <path d="M4 12h13a3 3 0 0 1 0 6H4Z" fill="#7a48b8" />
      <path d="M7 6v12M11 6v12M15 6v12" stroke="#d8c3f3" strokeWidth="0.9" />
      <ellipse cx="4" cy="12" rx="1.6" ry="6" fill="#5c3290" />
    </>
  ),
  papyrus: (
    <>
      <path d="M6 5h11v14H6Z" fill="#ecd9a8" stroke="#9b7c3e" />
      <rect x="4" y="3.5" width="15" height="3" rx="1.5" fill="#c9a865" stroke="#8b6a2c" />
      <rect x="4" y="17.5" width="15" height="3" rx="1.5" fill="#c9a865" stroke="#8b6a2c" />
      <path d="M8.5 9.5h6M8.5 12h6M8.5 14.5h4" stroke="#9b7c3e" strokeWidth="0.9" />
    </>
  ),
  gear: (
    <>
      <path d={GEAR} fill="#7fcf94" stroke="#1f5f33" strokeWidth="1" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.8" fill="#1f5f33" />
    </>
  ),
  compass: (
    <>
      <path d="M12 5 6 20.5M12 5l6 15.5" stroke="#1f5f33" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M12 5 6 20.5M12 5l6 15.5" stroke="#7fcf94" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M7.8 15.5Q12 18 16.2 15.5" stroke="#1f5f33" strokeWidth="1.4" fill="none" />
      <circle cx="12" cy="4.5" r="2.2" fill="#7fcf94" stroke="#1f5f33" />
    </>
  ),
  tablet: (
    <>
      <path d="M5.5 3.5h13l-1 17h-11Z" fill="#7fcf94" stroke="#1f5f33" strokeLinejoin="round" />
      <path
        d="M8.5 7.5h7M8.5 10.5h7M8.5 13.5h6M8.5 16.5h4"
        stroke="#1f5f33"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="10" fill="#e8b730" stroke="#8a5e0e" strokeWidth="1.2" />
      <circle cx="12" cy="12" r="7" fill="none" stroke="#f9dc7a" strokeWidth="1.1" />
      <path d="M8 8.5a5.5 5.5 0 0 1 4-2" stroke="#fff4c4" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  shield: (
    <>
      <path
        d="M12 2.5 20 5.5v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6Z"
        fill="#c9403a"
        stroke="#6e1d1a"
        strokeWidth="1.2"
      />
      <path d="M12 5.5v13M7 10h10" stroke="#f3b2a8" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  laurel: (
    <>
      <path d="M12 21C6.5 19.5 4 15 4.5 9" stroke="#2f7a45" strokeWidth="1.3" fill="none" />
      <path d="M12 21c5.5-1.5 8-6 7.5-12" stroke="#2f7a45" strokeWidth="1.3" fill="none" />
      {[
        [5, 9, -30],
        [5.4, 12.5, -45],
        [6.8, 15.8, -60],
        [9, 18.6, -75],
        [19, 9, 30],
        [18.6, 12.5, 45],
        [17.2, 15.8, 60],
        [15, 18.6, 75],
      ].map(([x, y, r]) => (
        <ellipse
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          rx="1.4"
          ry="2.6"
          fill="#55b06d"
          transform={`rotate(${r} ${x} ${y})`}
        />
      ))}
    </>
  ),
  victory: (
    <>
      <circle cx="12" cy="12" r="10" fill="#c9403a" stroke="#6e1d1a" strokeWidth="1.2" />
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="#f5c451" strokeOpacity="0.55" />
    </>
  ),
  defeat: (
    <>
      <circle cx="12" cy="12" r="10" fill="#3a1f1d" stroke="#c9403a" strokeWidth="1.4" />
      <path
        d="M9 4.5 11.5 10 8.5 13l3 6.5"
        stroke="#7d2b26"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </>
  ),
  discard: (
    <>
      <rect
        x="5"
        y="3"
        width="11"
        height="15"
        rx="1.8"
        fill="#4b4b57"
        stroke="#a3a3b5"
        transform="rotate(-10 10 10)"
      />
      <rect x="8" y="5.5" width="11" height="15" rx="1.8" fill="#5c5c6b" stroke="#c8c8d6" />
      <path d="M11 11l5 5M16 11l-5 5" stroke="#e8b730" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  pawn: (
    <>
      <circle cx="12" cy="6.5" r="3.5" fill="#e3c48a" stroke="#7b5a22" />
      <path
        d="M8.5 21c0-5 1.5-8 3.5-10.5 2 2.5 3.5 5.5 3.5 10.5Z"
        fill="#e3c48a"
        stroke="#7b5a22"
      />
      <rect x="6.5" y="19.5" width="11" height="2.5" rx="1" fill="#c9a865" stroke="#7b5a22" />
    </>
  ),
  chain: (
    <>
      <rect
        x="2.5"
        y="8.5"
        width="11"
        height="7"
        rx="3.5"
        fill="none"
        stroke="#c9cfd6"
        strokeWidth="2"
      />
      <rect
        x="10.5"
        y="8.5"
        width="11"
        height="7"
        rx="3.5"
        fill="none"
        stroke="#8e98a3"
        strokeWidth="2"
      />
    </>
  ),
  wonder: (
    <>
      <path d="M2 20h20L12 4Z" fill="#d9a85a" stroke="#7a5420" strokeLinejoin="round" />
      <path d="M12 4 9 20M5.2 15h13.6M7.8 11h8.4" stroke="#7a5420" strokeWidth="0.9" />
    </>
  ),
  swords: (
    <>
      <path d="M4 4l11 11M20 4 9 15" stroke="#d6dde4" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M13 17l4-4M11 17l-4-4" stroke="#8a5a2b" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M16.5 17.5l3 3M7.5 17.5l-3 3"
        stroke="#8a5a2b"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </>
  ),
  cards: (
    <>
      <rect
        x="4"
        y="4"
        width="10"
        height="15"
        rx="1.6"
        fill="#5c5c6b"
        stroke="#c8c8d6"
        transform="rotate(-12 9 11)"
      />
      <rect
        x="10"
        y="5"
        width="10"
        height="15"
        rx="1.6"
        fill="#3b82f6"
        stroke="#bcd4fb"
        transform="rotate(8 15 12)"
      />
    </>
  ),
};

/** The painted image behind each icon name. */
const RASTER: Record<SevenIconName, string> = {
  wood: "icon-wood",
  stone: "icon-stone",
  clay: "icon-clay",
  ore: "icon-ore",
  glass: "icon-glass",
  loom: "icon-loom",
  papyrus: "icon-papyrus",
  gear: "icon-gear",
  compass: "icon-compass",
  tablet: "icon-tablet",
  coin: "icon-coin",
  shield: "icon-shield",
  laurel: "icon-laurel",
  victory: "token-victory-1",
  defeat: "token-defeat",
  discard: "icon-sell",
  pawn: "token-edifice-pawn",
  chain: "icon-chain",
  wonder: "icon-wonder-stage",
  swords: "icon-shield",
  cards: "icon-hand",
  trade: "icon-trade",
  "science-any": "icon-science-any",
  edifice: "icon-edifice",
};

interface Props {
  name: SevenIconName;
  className?: string;
  /** Accessible name; decorative (hidden) when omitted. */
  title?: string;
}

export default function SevenIcon({ name, className, title }: Props) {
  const src = artUrl(RASTER[name]);
  if (src || !ICONS[name]) {
    return (
      <img
        src={src}
        alt={title ?? ""}
        title={title}
        draggable={false}
        aria-hidden={title ? undefined : true}
        className={cn("inline-block h-4 w-4 shrink-0 select-none object-contain", className)}
      />
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("inline-block h-4 w-4 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill="none"
    >
      {title && <title>{title}</title>}
      {ICONS[name]}
    </svg>
  );
}

/** The conflict token for a victory worth `value` (1, 3 or 5). */
function victoryToken(value: number | string): string | undefined {
  const n = Math.abs(Number(String(value).replace(/[^0-9]/g, "")));
  return artUrl(`token-victory-${n >= 5 ? 5 : n >= 3 ? 3 : 1}`);
}

/**
 * A coin or laurel with its number on it, the way the cards print amounts.
 * Victory tokens are the bronze / silver / gold laurel of their age; a
 * defeat is the broken-sword token itself, its −1 in the tooltip.
 */
export function Amount({
  kind,
  value,
  className,
  textClass = "text-4xs",
}: {
  kind: "coin" | "laurel" | "victory" | "defeat" | "shield";
  value: number | string;
  /** Size of the disc, e.g. `h-5 w-5`. */
  className?: string;
  /** The number's size, to match the disc. */
  textClass?: string;
}) {
  const token = kind === "victory" ? victoryToken(value) : undefined;
  if (kind === "defeat" && artUrl("token-defeat")) {
    return (
      <span
        title={`Defeat ${value}`}
        className={cn("relative inline-flex h-5 w-5 shrink-0 drop-shadow", className)}
      >
        <SevenIcon name="defeat" className="h-full w-full" />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "relative inline-flex h-5 w-5 shrink-0 items-center justify-center drop-shadow",
        className,
      )}
    >
      {token ? (
        <img
          src={token}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full select-none object-contain"
        />
      ) : (
        <SevenIcon name={kind} className="absolute inset-0 h-full w-full" />
      )}
      <span
        className={cn(
          "relative font-card font-bold leading-none tabular-nums",
          textClass,
          kind === "shield" ? "text-white" : "text-amber-950",
        )}
        style={
          kind === "shield"
            ? { textShadow: "0 1px 2px rgb(0 0 0 / 0.9)" }
            : { textShadow: "0 0 3px rgb(255 240 210 / 0.9)" }
        }
      >
        {value}
      </span>
    </span>
  );
}

/** A score-pad category's painted emblem (the coins category is the Treasury). */
export function ScoreIcon({
  category,
  className,
}: {
  category: ScoreCategory;
  className?: string;
}) {
  const src = artUrl(`score-${category === "coins" ? "treasury" : category}`);
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      className={cn("inline-block h-4 w-4 shrink-0 select-none object-contain", className)}
    />
  );
}

/** A struck coin (the 3-coin piece, a laureled head) for a city's treasury. */
export function CoinToken({ className }: { className?: string }) {
  const src = artUrl("coin-3");
  if (!src) return <SevenIcon name="coin" className={className} />;
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      className={cn(
        "inline-block h-4 w-4 shrink-0 select-none object-contain drop-shadow",
        className,
      )}
    />
  );
}
