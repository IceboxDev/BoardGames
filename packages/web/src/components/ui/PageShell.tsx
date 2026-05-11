import type { HTMLAttributes, ReactNode } from "react";

// ── PageShell ────────────────────────────────────────────────────────────
//
// The single page-shell primitive. Owns the page's outer container —
// background, height/scroll strategy, and the optional top-nav slot. Pair
// with `PageMain` for scroll- and fixed-height pages; for `layout="centered"`,
// the shell renders its own `<main>` (centering is the entire point of that
// layout, so callers should not double-wrap).
//
// Layout modes:
//   "scroll" (default) — grows vertically; body scrolls. Standard pages.
//   "fixed"            — viewport-locked; the inner main owns its scroll.
//                        Calendars, game boards, anything whose primary
//                        surface must stay on-screen.
//   "centered"         — content vertically + horizontally centered. Login,
//                        brief loading screens, hero confirmation pages.
//
// Background modes:
//   "grid" (default)   — `bg-surface-950 bg-grid`. Standard app surface.
//   "plain"            — `bg-surface-950`. Brief states (loading) where the
//                        dot grid would feel like clutter.
//   "none"             — transparent. Use when nesting under another shell
//                        that owns the background (e.g. the route Layout
//                        that wraps games).

export type PageShellLayout = "scroll" | "fixed" | "centered";
export type PageShellBackground = "grid" | "plain" | "none";

type PageShellProps = {
  layout?: PageShellLayout;
  background?: PageShellBackground;
  /** Top navigation slot. Pass `<TopNav>...</TopNav>` or omit. */
  topNav?: ReactNode;
  children: ReactNode;
};

// `min-h-dvh` (not `min-h-screen`) because the dynamic-viewport unit handles
// mobile address-bar collapse correctly. Static `100vh` causes the page to
// jump as the URL bar hides on scroll.
const SCROLL_OUTER = "flex min-h-dvh flex-col";
const FIXED_OUTER = "flex h-dvh min-h-0 flex-col overflow-hidden";

const BACKGROUND_CLASSES: Record<PageShellBackground, string> = {
  grid: "bg-surface-950 bg-grid",
  plain: "bg-surface-950",
  none: "",
};

export function PageShell({
  layout = "scroll",
  background = "grid",
  topNav,
  children,
}: PageShellProps) {
  const bgCls = BACKGROUND_CLASSES[background];
  const bgSuffix = bgCls ? ` ${bgCls}` : "";

  if (layout === "centered") {
    // Centered pages get their `<main>` from the shell so callers never
    // re-wire flex centering at every site. The outer is `min-h-dvh` (not
    // `h-dvh`) so the page can still grow when content is taller than the
    // viewport — the centering then degrades gracefully into top-anchored
    // scroll instead of clipping.
    return (
      <div className={`${SCROLL_OUTER}${bgSuffix}`}>
        {topNav}
        <main className="flex flex-1 items-center justify-center px-4 py-6">{children}</main>
      </div>
    );
  }

  const outerCls = layout === "fixed" ? FIXED_OUTER : SCROLL_OUTER;
  return (
    <div className={`${outerCls}${bgSuffix}`}>
      {topNav}
      {children}
    </div>
  );
}

// ── PageMain ─────────────────────────────────────────────────────────────
//
// The standard `<main>` content container for scroll- and fixed-layout
// pages. Provides a centered, padded body with a width cap and forwards
// arbitrary HTMLElement attributes (`id`, `aria-*`, etc.) so callers can
// wire portal-target ids or extra a11y metadata without escape-hatching.
//
// Width caps map to Tailwind `max-w-*`:
//   md   (28rem)   narrow forms / focused single-card content
//   2xl  (42rem)   reading-width content
//   3xl  (48rem)   default — most app pages (Profile, History, Gallery)
//   6xl  (72rem)   wide grids and multi-column layouts
//   7xl  (80rem)   admin tables and dense data views
//   full           no cap; fills parent
//
// Padding presets (responsive):
//   tight        px-3 py-2 sm:px-6                      calendars, dashboards
//   comfortable  px-4 py-6 sm:px-6 sm:py-8              default — most pages
//   spacious     px-4 py-6 sm:px-8 sm:py-10 lg:px-12    galleries, hero pages
//   none         no padding; caller controls everything
//
// `fillHeight` upgrades the main to `flex min-h-0 flex-1 flex-col` so its
// children can themselves flex-grow and own internal scrolling. Required
// for `layout="fixed"` pages whose surface (calendar, game board) needs to
// fit within the viewport. Without it, the main is `flex-1` only — fine
// for content-driven scroll pages, wrong for fixed-height ones.

export type PageMainWidth = "md" | "2xl" | "3xl" | "6xl" | "7xl" | "full";
export type PageMainPadding = "tight" | "comfortable" | "spacious" | "none";

type PageMainProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  width?: PageMainWidth;
  padding?: PageMainPadding;
  fillHeight?: boolean;
  children: ReactNode;
};

const WIDTH_CLASSES: Record<PageMainWidth, string> = {
  md: "max-w-md",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
  full: "",
};

const PADDING_CLASSES: Record<PageMainPadding, string> = {
  tight: "px-3 py-2 sm:px-6",
  comfortable: "px-4 py-6 sm:px-6 sm:py-8",
  spacious: "px-4 py-6 sm:px-8 sm:py-10 lg:px-12",
  none: "",
};

export function PageMain({
  width = "3xl",
  padding = "comfortable",
  fillHeight = false,
  className,
  children,
  ...rest
}: PageMainProps) {
  const widthCls = WIDTH_CLASSES[width];
  const paddingCls = PADDING_CLASSES[padding];
  const heightCls = fillHeight ? "flex min-h-0 flex-1 flex-col" : "flex-1";
  const classes = ["mx-auto w-full", widthCls, heightCls, paddingCls, className]
    .filter(Boolean)
    .join(" ");

  return (
    <main className={classes} {...rest}>
      {children}
    </main>
  );
}
