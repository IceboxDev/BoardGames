import type { ReactNode } from "react";

// ── HeroBanner ───────────────────────────────────────────────────────────
//
// The torch-lit banner at the top of the hall, the campaign screen, and the
// party screen. All three were copy-pasted: the same `dnd-hero-glow` box, the
// same crimson bloom overlay, the same eyebrow/title/subtitle stack.
//
// `glow="strong"` is the hall's full-page banner (a brighter, lower bloom);
// the default suits the smaller campaign/party headers. `media` is the slot the
// hall fills with its spinning d20, and `shimmer` adds the slow light sweep
// that only the hall banner runs.

type HeroBannerProps = {
  eyebrow: ReactNode;
  title: ReactNode;
  /** Supporting line under the title. See `subtitleStyle`. */
  subtitle?: ReactNode;
  /**
   * `tagline` (default) — a short italic line: a campaign's tagline, a party's
   * motto. `prose` — a width-capped explanatory paragraph, upright, as the
   * hall uses. These are genuinely different: collapsing them italicised the
   * hall's instructions and let them run the full banner width.
   */
  subtitleStyle?: "tagline" | "prose";
  /** Extra content below the subtitle (e.g. a level-range kicker). */
  children?: ReactNode;
  /** Rendered above the text stack — the hall's d20. */
  media?: ReactNode;
  glow?: "soft" | "strong";
  shimmer?: boolean;
  /** Title size. `lg` for the hall, `md` elsewhere. */
  size?: "md" | "lg";
  className?: string;
};

export function HeroBanner({
  eyebrow,
  title,
  subtitle,
  subtitleStyle = "tagline",
  children,
  media,
  glow = "soft",
  shimmer = false,
  size = "md",
  className = "",
}: HeroBannerProps) {
  const pad = size === "lg" ? "p-6 sm:p-8" : "p-5 sm:p-6";
  const titleCls = size === "lg" ? "mt-2 text-4xl sm:text-5xl" : "mt-1 text-3xl sm:text-4xl";
  const subtitleCls =
    subtitleStyle === "prose"
      ? "font-serif-body mx-auto mt-3 max-w-md text-sm leading-relaxed text-amber-200/75"
      : "font-serif-body mt-2 text-sm italic leading-relaxed text-amber-200/70";
  return (
    <div
      className={`dnd-hero-glow relative shrink-0 overflow-hidden rounded-3xl border border-amber-400/30 bg-gradient-to-br from-dnd-blood via-dnd-ink to-black text-center ${pad} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 ${
          glow === "strong" ? "dnd-hero-bloom-strong" : "dnd-hero-bloom"
        }`}
      />
      {shimmer && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-amber-200/20 to-transparent motion-safe:animate-seal-shimmer"
        />
      )}
      <div className="relative flex flex-col items-center gap-4">
        {media && <span aria-hidden="true">{media}</span>}
        <div>
          <p className="font-fantasy text-2xs font-bold uppercase tracking-eyebrow text-amber-300/80">
            {eyebrow}
          </p>
          <h1 className={`dnd-hero-title font-fantasy font-bold text-amber-100 ${titleCls}`}>
            {title}
          </h1>
          {subtitle && <p className={subtitleCls}>{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}
