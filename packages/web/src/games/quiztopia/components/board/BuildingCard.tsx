import type { BuildingStatus } from "@boardgames/core/games/quiztopia/types";
import { motion, useReducedMotion } from "framer-motion";
import type { Ref } from "react";
import { boardSpring } from "../../../../components/board/motion";
import { cardChrome } from "../../../../components/card-fan/card-chrome";
import { Badge, type BadgeTone, MicroLabel, TONE_TEXT } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { type District, TONE_LIT, TONE_STRIP } from "../../bands";
import { BuildingGlyph } from "../common/BuildingGlyph";

// One building of the city. Dark buildings are silhouettes with outlined
// windows; lit ones glow in their band tone with the windows filled. The
// status is never colour-only: index label, LIT/DARK/WON/LOST badge, the
// glyph's structural windows and the aria-label all carry it. The outer
// `layoutId` lets a building glide from the city row to a shelf; the inner
// face flips (rotateY) when its status changes.

export type BuildingCardSize = "city" | "shelf" | "compact";

type Props = {
  district: District;
  status: BuildingStatus;
  size?: BuildingCardSize;
  /** Clickable (the active seat choosing, or a Besetzung target). */
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  /** Roving tabindex from the row; ignored when not selectable. */
  tabIndex?: number;
  /** German building names when the board language is DE. */
  lang?: "en" | "de";
  layoutId?: string;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
};

const STATUS_LABEL: Record<BuildingStatus, string> = {
  dark: "DARK",
  bright: "LIT",
  won: "WON",
  lost: "LOST",
};

const STATUS_WORD: Record<BuildingStatus, string> = {
  dark: "dark",
  bright: "lit",
  won: "won",
  lost: "lost",
};

const STATUS_BADGE_TONE: Record<BuildingStatus, BadgeTone | null> = {
  dark: "neutral",
  bright: null, // band tone
  won: "emerald",
  lost: "rose",
};

const SIZE_CLASS: Record<BuildingCardSize, { card: string; glyph: number; name: string }> = {
  city: { card: "w-full aspect-card", glyph: 40, name: "text-2xs" },
  shelf: { card: "w-14 aspect-card sm:w-16", glyph: 26, name: "text-3xs" },
  compact: { card: "w-full aspect-card", glyph: 28, name: "text-3xs" },
};

export function buildingAriaLabel(
  district: District,
  status: BuildingStatus,
  lang: "en" | "de" = "en",
): string {
  const building = lang === "de" ? district.buildingLabelDe : district.buildingLabel;
  const category = lang === "de" ? district.de : district.en;
  return `${building}, district ${district.label} ${category}, ${STATUS_WORD[status]}`;
}

export default function BuildingCard({
  district,
  status,
  size = "city",
  selectable = false,
  selected = false,
  onSelect,
  tabIndex,
  lang = "en",
  layoutId,
  className,
  ref,
}: Props) {
  const reduced = useReducedMotion();
  const lit = status === "bright" || status === "won";
  const dim = status === "dark" || status === "lost";
  const sz = SIZE_CLASS[size];
  const badgeTone = STATUS_BADGE_TONE[status] ?? district.tone;
  const name = lang === "de" ? district.buildingLabelDe : district.buildingLabel;

  const face = cn(
    cardChrome({
      size: sz.card,
      rounded: "lg",
      selected,
      hover: selectable ? "lift" : "none",
      glowClass: selectable && !selected ? "ring-1 ring-fg-strong/30" : "",
      className: cn(
        "flex flex-col items-center border bg-surface-900 text-left",
        lit ? TONE_LIT[district.tone] : "border-line",
        status === "lost" && "border-rose-700/40 bg-rose-950/30",
        status === "won" && "bg-emerald-950/20",
        dim && "saturate-50",
      ),
    }),
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-fg-strong/60",
    className,
  );

  const content = (
    <motion.div
      key={status}
      initial={reduced ? false : { rotateY: 90, opacity: 0.4 }}
      animate={{ rotateY: 0, opacity: 1 }}
      transition={reduced ? { duration: 0 } : boardSpring}
      className="flex h-full w-full flex-col items-center"
      style={{ transformStyle: "preserve-3d" }}
    >
      <span className={cn("h-1 w-full shrink-0", TONE_STRIP[district.tone])} aria-hidden="true" />
      <div className="flex w-full items-center justify-between px-1.5 pt-1">
        <MicroLabel className="font-semibold">{district.label}</MicroLabel>
        <Badge tone={badgeTone} size="xs">
          {STATUS_LABEL[status]}
        </Badge>
      </div>
      <div
        className={cn(
          "flex min-h-0 flex-1 items-center justify-center",
          lit ? TONE_TEXT[district.tone] : "text-fg-muted",
        )}
      >
        <BuildingGlyph name={district.building} lit={lit} size={sz.glyph} />
      </div>
      <span
        className={cn(
          "w-full truncate px-1.5 pb-1.5 text-center font-medium",
          sz.name,
          lit ? "text-fg-strong" : "text-fg-secondary",
        )}
      >
        {name}
      </span>
    </motion.div>
  );

  const label = buildingAriaLabel(district, status, lang);

  if (selectable) {
    return (
      <motion.div layoutId={layoutId} layout={!!layoutId} transition={boardSpring}>
        {/* biome-ignore lint/correctness/noRestrictedElements: a clickable card face is a game piece, not app chrome; Button's padding/label chrome would break the face. */}
        <button
          ref={ref}
          type="button"
          onClick={onSelect}
          tabIndex={tabIndex}
          aria-pressed={selected}
          aria-label={label}
          className={face}
        >
          {content}
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      layoutId={layoutId}
      layout={!!layoutId}
      transition={boardSpring}
      role="img"
      aria-label={label}
      className={face}
    >
      {content}
    </motion.div>
  );
}
