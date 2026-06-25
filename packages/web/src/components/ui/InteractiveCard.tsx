import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

// ── InteractiveCard ──────────────────────────────────────────────────────
//
// The interactive sibling of `Surface`: a quiet, full-card clickable surface
// for NAVIGATION (open a page, a modal, a profile) — not selection. It owns
// the chrome that three sites had copy-pasted verbatim (ProfilePage's mode/nav
// cards, CalendarSyncCard, PlayerCard):
//
//   group rounded-2xl border border-white/[0.06] bg-surface-900/60
//   transition-all duration-300 hover:border-white/15 hover:bg-surface-900
//
// plus a focus-visible ring the hand-rolled versions all forgot. Inner layout
// (flex direction, gap, text alignment, icon/title slots) is the caller's job
// via `className` + children — that is composition, not an escape hatch.
//
// NOT to be confused with:
//   Surface         — static bordered panel (no hover/focus/click).
//   SelectableCard  — a tone-driven option *tile* with a selected ring and a
//                     hover lift, on `bg-surface-800`. Use that for pickers
//                     with a chosen state; use this for plain navigation.
//
// Polymorphic via `as` so the same chrome backs a <button> (default), a
// react-router <Link>, or an <a> without retyping the className. `type="button"`
// is supplied automatically for the button case and can be overridden.

export type InteractiveCardPadding = "none" | "sm" | "md" | "lg";

const PADDINGS: Record<InteractiveCardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "px-5 py-4",
  lg: "px-5 py-4 sm:px-6 sm:py-5",
};

const CHROME =
  "group rounded-2xl border border-white/[0.06] bg-surface-900/60 transition-all duration-300 " +
  "hover:border-white/15 hover:bg-surface-900 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60";

type InteractiveCardOwnProps<T extends ElementType> = {
  /** Element/component to render. Default `"button"`; pass `Link` or `"a"`. */
  as?: T;
  padding?: InteractiveCardPadding;
  className?: string;
  children: ReactNode;
};

type InteractiveCardProps<T extends ElementType> = InteractiveCardOwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof InteractiveCardOwnProps<T>>;

export function InteractiveCard<T extends ElementType = "button">({
  as,
  padding = "md",
  className = "",
  children,
  ...rest
}: InteractiveCardProps<T>) {
  const Tag = (as ?? "button") as ElementType;
  const cls = [CHROME, PADDINGS[padding], className].filter(Boolean).join(" ");
  // Default a real button to type="button" so it never submits an enclosing
  // form by accident; callers can still pass `type` to override.
  const typeProp = Tag === "button" ? { type: "button" as const } : {};
  return (
    <Tag className={cls} {...typeProp} {...rest}>
      {children}
    </Tag>
  );
}
