import type { ElementType, HTMLAttributes, ReactNode } from "react";

// ── Eyebrow / MicroLabel ─────────────────────────────────────────────────
//
// The two uppercase-label primitives. Between them they own every "small,
// tracked, uppercase" string in app chrome, so nobody has to pick a
// letter-spacing again. Before these, the same two visual roles were spelled
// with nine different `tracking-[…]` values across ~20 files.
//
//   <Eyebrow>    the kicker ABOVE a title or section. Widest tracking
//                (`tracking-eyebrow`), `text-2xs`, tone-colored.
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
// without losing the typography.

export type EyebrowTone = "accent" | "amber" | "sky" | "emerald" | "rose" | "muted";

const EYEBROW_TONE: Record<EyebrowTone, string> = {
  accent: "text-accent-400",
  amber: "text-amber-300",
  sky: "text-sky-300",
  emerald: "text-emerald-300",
  rose: "text-rose-300",
  muted: "text-fg-muted",
};

type EyebrowProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  tone?: EyebrowTone;
  children: ReactNode;
};

export function Eyebrow({
  as: Tag = "p",
  tone = "accent",
  className = "",
  children,
  ...rest
}: EyebrowProps) {
  const cls = ["text-2xs font-semibold uppercase tracking-eyebrow", EYEBROW_TONE[tone], className]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag className={cls} {...rest}>
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
  className = "",
  children,
  ...rest
}: MicroLabelProps) {
  const cls = ["text-3xs uppercase tracking-label", inheritColor ? "" : "text-fg-muted", className]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}
