// The Reading Room's newspaper vocabulary: one place for every piece of
// print furniture the trainer's pages share. Colours are theme tokens only
// (fg-*, line-*, accent) so the paper re-themes with the rest of the app;
// a domain's identity colour comes from domains.ts.

import type { QuizLang } from "@boardgames/core/protocol";
import type { ArticleImage as ArticleImageData } from "@boardgames/core/quiz/content-types";
import { type ComponentProps, type ReactNode, type Ref, useState } from "react";
import { Link } from "react-router-dom";
import { Button, SearchInput } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { type Domain, domainOf } from "../../domains";
import { DomainIcon, type DomainIconSize } from "../common/DomainIcon";
import { KICKER, RULE_DOUBLE_TOP } from "./paper-style";

// ── Masthead ───────────────────────────────────────────────────────────────

/**
 * The nameplate with its two ears and the dateline bar. `compact` drops the
 * ears and shrinks the nameplate for the study pages' sticky head.
 */
export function Masthead({
  dateLine,
  pageLabel,
  edition,
  nav,
  leftEar,
  rightEar,
  compact = false,
  homeTo,
  className,
}: {
  /** "Saturday, 24 October 2026" */
  dateLine: string;
  /** "Front page", "Page A2", "The Quiz Page" … */
  pageLabel: string;
  /** "Vol. II · No. 297" */
  edition: string;
  /** Right end of the dateline: the paper's own links (archive, journal …). */
  nav?: ReactNode;
  leftEar?: ReactNode;
  rightEar?: ReactNode;
  compact?: boolean;
  /** Where the nameplate leads (the front page). */
  homeTo?: string;
  className?: string;
}) {
  const plate = (
    <span
      className={cn(
        "block text-center font-masthead leading-none text-fg-strong",
        compact ? "text-3xl md:text-4xl" : "text-4xl md:text-6xl lg:text-7xl",
      )}
    >
      The Daily Quiz
    </span>
  );
  return (
    <header className={cn("flex flex-col", className)}>
      <div
        className={cn(
          "grid items-center gap-4",
          compact || (!leftEar && !rightEar)
            ? "grid-cols-1"
            : "grid-cols-1 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,14rem)]",
        )}
      >
        {!compact && leftEar && <div className="hidden md:block">{leftEar}</div>}
        {homeTo ? (
          <Link
            to={homeTo}
            className="rounded-ui-md focus-visible:outline-2 focus-visible:outline-accent-400"
          >
            {plate}
          </Link>
        ) : (
          plate
        )}
        {!compact && rightEar && <div className="hidden md:block">{rightEar}</div>}
      </div>
      <div
        className={cn(
          KICKER,
          RULE_DOUBLE_TOP,
          "mt-2 flex min-h-8 items-center justify-between gap-3 border-b border-b-fg-primary py-1 text-fg-primary",
        )}
      >
        <span className="hidden md:inline">{edition}</span>
        <span className="hidden sm:inline">{dateLine}</span>
        <span className="text-accent-300">{pageLabel}</span>
        {nav && <nav className="flex items-center gap-1">{nav}</nav>}
      </div>
    </header>
  );
}

/** A boxed ear beside the nameplate. */
export function Ear({
  title,
  line,
  note,
  align = "left",
  tone = "accent",
}: {
  title: string;
  line: ReactNode;
  note?: ReactNode;
  align?: "left" | "right";
  tone?: "accent" | "sky";
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 border border-line-strong px-3 py-2",
        align === "right" && "text-right",
      )}
    >
      <span className={cn(KICKER, tone === "sky" ? "text-sky-300" : "text-accent-300")}>
        {title}
      </span>
      <span className="font-news text-sm text-fg-primary">{line}</span>
      {note && <span className="font-news text-xs italic text-fg-muted">{note}</span>}
    </div>
  );
}

/** The page footer: folio, motto, progress. */
export function Folio({ page, right }: { page: string; right?: ReactNode }) {
  return (
    <footer
      className={cn(
        KICKER,
        "flex min-h-8 items-center justify-between gap-3 border-t border-line-strong text-fg-primary",
      )}
    >
      <span>{page}</span>
      <span className="hidden text-fg-muted sm:inline">The Daily Quiz · one fact at a time</span>
      <span>{right}</span>
    </footer>
  );
}

// ── Type ───────────────────────────────────────────────────────────────────

/** Section kicker: the domain's icon and its name in its own ink. */
export function Kicker({
  domain,
  children,
  icon = 24,
  className,
}: {
  domain: string;
  /** Extra words after the domain name ("· article 1 of 3"). */
  children?: ReactNode;
  icon?: DomainIconSize;
  className?: string;
}) {
  const d = domainOf(domain);
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <DomainIcon domain={domain} size={icon} />
      <span className={cn(KICKER, d.ink, "truncate")}>
        {d.en}
        {children}
      </span>
    </span>
  );
}

const HEADLINE_SIZE = {
  xl: "text-3xl leading-tight md:text-5xl md:leading-none font-black",
  lg: "text-2xl leading-tight md:text-4xl font-black",
  md: "text-xl leading-snug md:text-2xl font-bold",
  sm: "text-lg leading-snug font-bold",
} as const;

/** A headline in the paper's display serif. */
export function Headline({
  as: Tag = "h2",
  size = "md",
  className,
  children,
}: {
  as?: "h1" | "h2" | "h3" | "p";
  size?: keyof typeof HEADLINE_SIZE;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag className={cn("font-headline text-fg-strong", HEADLINE_SIZE[size], className)}>
      {children}
    </Tag>
  );
}

/** The ruled line under a headline: byline left, reading facts right. */
export function Byline({
  left = "By the Quiz Desk",
  right,
}: {
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div
      className={cn(
        KICKER,
        "flex items-center justify-between gap-3 border-y border-line-strong py-1.5 text-fg-muted",
      )}
    >
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

/** Running text in ruled newspaper columns (fewer on narrow screens). */
export function Columns({
  count,
  className,
  children,
  ref,
}: {
  count: 1 | 2 | 3;
  className?: string;
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      className={cn(
        "font-news text-base leading-relaxed text-fg-primary",
        count === 2 && "md:cols-news-2",
        count === 3 && "md:cols-news-2 xl:cols-news-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A section head between double and single rules ("Inside · 14 sections"). */
export function SectionHead({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div
      className={cn(
        KICKER,
        RULE_DOUBLE_TOP,
        "flex items-center justify-between gap-3 border-b border-b-fg-primary py-1 text-fg-primary",
      )}
    >
      <span>{children}</span>
      {right && <span>{right}</span>}
    </div>
  );
}

/** A double-ruled box (the Revision Corner, the question on the Quiz Page). */
export function BoxedPanel({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "neutral" | "sky";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "border-3 border-double p-4",
        tone === "sky" ? "border-sky-300/70" : "border-line-strong",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ── Actions ────────────────────────────────────────────────────────────────

const PAPER_BUTTON = "font-news text-xs font-semibold uppercase tracking-pill";

/** The paper's button: square, small caps; `primary` is the accent fill. */
export function PaperButton({
  primary = false,
  className,
  ...rest
}: Omit<ComponentProps<typeof Button>, "variant" | "shape" | "tone"> & { primary?: boolean }) {
  return (
    <Button
      {...rest}
      shape="square"
      variant={primary ? "solid" : "secondary"}
      tone={primary ? "accent" : undefined}
      className={cn(PAPER_BUTTON, !primary && "bg-transparent border-fg-primary/60", className)}
    />
  );
}

/** A "continued on page A2" line: a link or button set in accent small caps. */
export function JumpLine({
  to,
  onClick,
  children,
}: {
  to?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const cls = cn(KICKER, "text-left text-accent-300 transition-colors hover:text-accent-200");
  return to ? (
    <Link to={to} className={cls}>
      ▸ {children}
    </Link>
  ) : (
    <Button variant="link" onClick={onClick} className={cn(cls, "h-auto p-0")}>
      ▸ {children}
    </Button>
  );
}

/** A small-caps text button (Show answer, + split, Mark read …). */
export function PrintButton({
  className,
  ...rest
}: Omit<ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <Button
      {...rest}
      variant="link"
      className={cn(
        KICKER,
        "h-auto gap-1.5 whitespace-nowrap p-0 text-accent-300 hover:text-accent-200 aria-pressed:text-fg-strong aria-pressed:underline aria-pressed:decoration-accent-300 aria-pressed:underline-offset-4",
        className,
      )}
    />
  );
}

// ── Controls ───────────────────────────────────────────────────────────────

/**
 * The paper's search line: a serif input over a ruled underline. Pass
 * `onSubmit` for a search box with its button (Enter searches), leave it out
 * for a live filter.
 */
export function PaperSearch({
  value,
  onChange,
  label,
  placeholder,
  onSubmit,
  submitLabel = "Search",
  minLength = 0,
  autoFocus,
  className,
}: {
  autoFocus?: boolean;
  value: string;
  onChange: (next: string) => void;
  label: string;
  placeholder?: string;
  onSubmit?: () => void;
  submitLabel?: string;
  /** The button stays disabled below this many characters. */
  minLength?: number;
  className?: string;
}) {
  const input = (
    <SearchInput
      containerClassName="min-w-0 flex-1"
      autoFocus={autoFocus}
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-none border-0 border-b border-fg-primary/60 bg-transparent font-news text-base focus:border-accent-300 focus:ring-0"
    />
  );
  if (!onSubmit) return <div className={cn("flex", className)}>{input}</div>;
  return (
    <form
      aria-label={label}
      className={cn("flex items-end gap-3", className)}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {input}
      <PaperButton type="submit" size="sm" disabled={value.trim().length < minLength}>
        {submitLabel}
      </PaperButton>
    </form>
  );
}

/** Small-caps options, the chosen one underlined in accent (a sort, a filter). */
export function PaperTabs<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: readonly { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (next: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <fieldset className={cn("flex min-w-0 items-center gap-3", className)}>
      <legend className="sr-only">{label}</legend>
      {options.map((o) => (
        <Button
          key={o.value}
          variant="link"
          aria-pressed={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            KICKER,
            "h-auto border-b-2 border-transparent p-0 pb-0.5 text-fg-muted hover:text-fg-strong",
            o.value === value && "border-accent-300 text-fg-strong",
          )}
        >
          {o.label}
        </Button>
      ))}
    </fieldset>
  );
}

/** The sections as toggles: each one's cut, its name on wide screens. */
export function SectionToggles({
  domains,
  selected,
  onToggle,
  withNames = false,
  className,
}: {
  domains: readonly Domain[];
  selected: ReadonlySet<string>;
  onToggle: (slug: string) => void;
  /** Print each name beside its cut (xl and up). */
  withNames?: boolean;
  className?: string;
}) {
  return (
    <fieldset className={cn("flex min-w-0 flex-wrap gap-1", className)}>
      <legend className="sr-only">Sections</legend>
      {domains.map((d) => {
        const on = selected.has(d.slug);
        return (
          <Button
            key={d.slug}
            variant="ghost"
            size="xs"
            shape="square"
            aria-pressed={on}
            aria-label={`Only ${d.en}`}
            title={d.en}
            onClick={() => onToggle(d.slug)}
            className={cn(
              "gap-1.5 border border-transparent px-1.5",
              on ? "border-fg-primary bg-fill text-fg-strong" : "opacity-60 hover:opacity-100",
            )}
          >
            <DomainIcon domain={d.slug} size={28} />
            {withNames && <span className={cn(KICKER, "hidden xl:inline", d.ink)}>{d.en}</span>}
          </Button>
        );
      })}
    </fieldset>
  );
}

/** A hairline meter in a section's own ink; decorative — print the numbers beside it. */
export function InkMeter({
  value,
  domain,
  className,
}: {
  value: number;
  domain?: string;
  className?: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div aria-hidden="true" className={cn("h-0.5 w-full bg-line-strong", className)}>
      <div
        className="h-full bg-accent-300"
        style={{ width: `${pct}%`, ...(domain ? { backgroundColor: domainOf(domain).color } : {}) }}
      />
    </div>
  );
}

const STAMP_TONE = {
  neutral: "border-fg-primary/60 text-fg-primary",
  accent: "border-accent-300/70 text-accent-300",
  sky: "border-sky-300/70 text-sky-300",
  emerald: "border-emerald-300/70 text-emerald-300",
  rose: "border-rose-300/70 text-rose-300",
} as const;

/** A square rubber-stamp mark: "Read 14:32", "New", "Corrected". */
export function Stamp({
  tone = "neutral",
  className,
  title,
  children,
}: {
  tone?: keyof typeof STAMP_TONE;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        KICKER,
        "inline-flex shrink-0 items-center gap-1 border px-1.5 py-px leading-tight",
        STAMP_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A centred italic notice: empty lists, the end of the back issues. */
export function PaperNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("py-6 text-center font-news text-sm italic text-fg-muted", className)}>
      {children}
    </p>
  );
}

// ── Pictures ───────────────────────────────────────────────────────────────

/**
 * A news photo, printed the way a paper prints one: the picture in one ink —
 * greyscale, a little contrast, tinted with the theme's accent (a warm theme
 * gets sepia, a cool one a cyanotype blue) — under a fine halftone screen
 * and a soft vignette, caption and credit under a hairline. `fill` crops it
 * to the figure's height (a photo column beside the text). Hotlinked like
 * every article picture; one that fails to load disappears.
 */
export function PaperPhoto({
  image,
  lang,
  fill = false,
  data,
  className,
}: {
  image: ArticleImageData;
  lang: QuizLang;
  /** Fill a box of fixed size, cropped to it (the front page's lead). */
  fill?: boolean;
  /** `data-*` attributes for the figure (a layout pass finds it by them). */
  data?: Record<`data-${string}`, string | number | undefined>;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  // Not filling a box, the photo is set whole at its own proportions across
  // the width `className` gives the figure.
  return (
    <figure {...data} className={cn("flex flex-col gap-1", className)}>
      <span
        className={cn("relative isolate block overflow-hidden bg-fill", fill && "min-h-0 flex-1")}
      >
        <img
          src={image.url}
          alt={image.alt[lang]}
          loading="lazy"
          referrerPolicy="no-referrer"
          width={image.width}
          height={image.height}
          onError={() => setBroken(true)}
          className={cn("news-photo block", fill ? "size-full object-cover" : "h-auto w-full")}
        />
        <span aria-hidden="true" className="absolute inset-0 bg-accent-300 mix-blend-color" />
        <span aria-hidden="true" className="halftone absolute inset-0" />
        <span aria-hidden="true" className="photo-vignette absolute inset-0" />
      </span>
      <figcaption
        lang={lang}
        className="hyphens-manual border-b border-line-strong pb-1 text-left font-news text-xs leading-snug italic text-fg-muted"
      >
        {image.caption[lang]}
        {image.credit && <span className="not-italic text-fg-disabled"> · {image.credit}</span>}
      </figcaption>
    </figure>
  );
}
