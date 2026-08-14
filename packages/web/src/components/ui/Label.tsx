import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { type CoreTone, TONE_TEXT } from "./tones";

// ── Eyebrow / MicroLabel ─────────────────────────────────────────────────
//
// The two uppercase-label primitives. Between them they own every "small,
// tracked, uppercase" string in app chrome, so nobody has to pick a
// letter-spacing again. Before these, the same two visual roles were spelled
// with nine different `tracking-[…]` values across ~20 files.
//
//   <Eyebrow>    the kicker ABOVE a title or section. Widest tracking
//                (`tracking-eyebrow`), tone-colored. `size` covers the three
//                real densities: sm (text-3xs, drawers/dense chrome),
//                md (text-2xs, the default kicker), lg (text-xs, section
//                labels above whole setup columns).
//                e.g. "Who's coming", "Tonight's quest", "History".
//
//   <MicroLabel> the dense in-row caption. Tighter (`tracking-label`),
//                `text-3xs`, muted by default.
//                e.g. a stat tile's caption, a match card's "Winners" /
//                "vs" role label.
//
// For a *status pill* ("Host", "Maybe", "Dungeon Master") use `Badge` —
// it owns `tracking-pill` plus the pill shape and tone fill.
//
// Both are polymorphic via `as` so they can be a <p>, <span>, <h2>, or <dt>
// without losing the typography. Tones come from the shared vocabulary in
// `tones.ts`; the no-color member is `"neutral"` (like every other primitive).

export type EyebrowTone = CoreTone | "neutral";
export type EyebrowSize = "sm" | "md" | "lg";

const EYEBROW_SIZE: Record<EyebrowSize, string> = {
  sm: "text-3xs",
  md: "text-2xs",
  lg: "text-xs",
};

type EyebrowProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  tone?: EyebrowTone;
  size?: EyebrowSize;
  /** Drop the tone color so the caller can color it (e.g. a per-game
   *  `text-[var(--accent)]`). Mirrors MicroLabel's prop of the same name. */
  inheritColor?: boolean;
  children: ReactNode;
};

export function Eyebrow({
  as: Tag = "p",
  tone = "accent",
  size = "md",
  inheritColor = false,
  className,
  children,
  ...rest
}: EyebrowProps) {
  return (
    <Tag
      className={cn(
        "font-semibold uppercase tracking-eyebrow",
        EYEBROW_SIZE[size],
        !inheritColor && TONE_TEXT[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

type MicroLabelProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  /** Drop the default `text-fg-muted` so the caller can color it. */
  inheritColor?: boolean;
  children: ReactNode;
};

export function MicroLabel({
  as: Tag = "span",
  inheritColor = false,
  className,
  children,
  ...rest
}: MicroLabelProps) {
  return (
    <Tag
      className={cn(
        "text-3xs uppercase tracking-label",
        !inheritColor && "text-fg-muted",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
