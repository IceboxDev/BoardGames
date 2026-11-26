import type { ReactNode } from "react";
import { useOptionalGameShell } from "../../hooks/useGameShell";
import { cn } from "../../lib/cn";
import { Button } from "../ui/Button";
import { Eyebrow } from "../ui/Label";
import { PageHeader } from "../ui/PageHeader";

// ── The Briefing ────────────────────────────────────────────────────────
//
// Every solo setup screen: the game's own 16:9 art as a hero with the title
// over it, then the screen's sections (`SetupChoiceCards`, `SetupOptions`)
// and a footer with the summary and Start. On a laptop (1280×800 and up)
// the whole screen fits without scrolling — the hero has one fixed height
// (`h-setup-hero`) and the sections size to their content; on a phone it
// scrolls and the footer stays pinned to the bottom of the screen.
//
// The art is the game's catalog thumbnail (read from the game shell), so a
// game needs nothing of its own to get one.

export interface SetupBriefingProps {
  title: ReactNode;
  /** Small caps line above the title ("Solo · you + 3 AI"). */
  eyebrow?: ReactNode;
  /** One line under the title; defaults to the game's short description. */
  blurb?: ReactNode;
  /** Hero art; defaults to the game's thumbnail. `null` for none. */
  art?: string | null;
  /** The footer (usually `<SetupFooter>`). */
  footer: ReactNode;
  children: ReactNode;
}

export function SetupBriefing({
  title,
  eyebrow,
  blurb,
  art,
  footer,
  children,
}: SetupBriefingProps) {
  const shell = useOptionalGameShell();
  const image = art === undefined ? shell?.def.thumbnail : art;
  const line = blurb === undefined ? shell?.def.descriptions.tight : blurb;
  return (
    <div className="relative z-raised flex h-full min-h-0 w-full flex-col overflow-y-auto">
      <div className="relative h-setup-hero shrink-0 overflow-hidden">
        {image && (
          <img
            src={image}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-surface-950/25 via-surface-950/60 to-surface-950" />
        <div className="absolute inset-0 bg-gradient-to-r from-surface-950/80 via-surface-950/20 to-transparent" />
        <div className="relative mx-auto flex h-full w-full max-w-6xl flex-col justify-end px-4 pb-3 sm:px-8">
          <PageHeader
            size="xl"
            title={title}
            eyebrow={eyebrow}
            subtitle={
              line ? (
                <span className="line-clamp-2 block max-w-2xl text-sm text-fg-secondary">
                  {line}
                </span>
              ) : undefined
            }
          />
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 pt-3 sm:px-8 lg:min-h-0">
        {children}
        <div className="sticky bottom-0 mt-auto bg-gradient-to-t from-surface-950 from-70% to-transparent pt-3 pb-4 sm:pb-5">
          {footer}
        </div>
      </div>
    </div>
  );
}

/** A titled region of the briefing: an eyebrow, an optional right-hand note, then its content. */
export function SetupSection({
  label,
  aside,
  grow = false,
  children,
}: {
  label: ReactNode;
  aside?: ReactNode;
  /** Take the briefing's leftover height (a gallery that fills the screen). */
  grow?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-2", grow && "min-h-0 flex-1")}>
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow as="h2" size="sm" inheritColor className="text-fg-secondary">
          {label}
        </Eyebrow>
        {aside && <span className="truncate text-xs text-fg-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/** The briefing's footer: what you're about to start, and Start. */
export function SetupFooter({
  summary,
  startLabel = "Start game",
  onStart,
  disabled = false,
}: {
  summary?: ReactNode;
  startLabel?: ReactNode;
  onStart: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <p className="min-w-0 truncate text-center text-sm text-fg-secondary sm:text-left">
        {summary}
      </p>
      <Button
        variant="primary"
        size="lg"
        onClick={onStart}
        disabled={disabled}
        className="shrink-0 sm:min-w-56"
      >
        {startLabel}
      </Button>
    </div>
  );
}
