import type { TimelineEventContent } from "@boardgames/core/quiz/content-types";
import { formatTimelineDate } from "@boardgames/core/quiz/timeline";
import { Link } from "react-router-dom";
import { PinIcon } from "../../../../components/icons";
import { cn } from "../../../../lib/cn";
import type { DomainTone } from "../../domains";
import { DATE_INK } from "./tones";

// A question's moment in time as one pill: "Pinned to your timeline ·
// 26 August 1841 — Hoffmann von Fallersleben writes …". A link to the
// timeline focused on that question when `to` is set, a plain caption
// otherwise (the wiki's date line for questions not studied yet).

type Props = {
  event: TimelineEventContent;
  lang: "en" | "de" | "ru";
  tone: DomainTone;
  /** Leading caption ("Pinned to your timeline"); none = date first. */
  caption?: string;
  /** Show the event's label after the date (default true). */
  withLabel?: boolean;
  to?: string;
  className?: string;
};

export function TimelineChip({
  event,
  lang,
  tone,
  caption,
  withLabel = true,
  to,
  className,
}: Props) {
  const date = formatTimelineDate(event, lang);
  const label =
    lang === "de"
      ? event.labelDe
      : lang === "ru"
        ? (event.labelRu ?? event.labelEn)
        : event.labelEn;
  const body = (
    <>
      <PinIcon className={cn("h-3 w-3 shrink-0", DATE_INK[tone])} />
      <span className="min-w-0 truncate">
        {caption && <span className="text-fg-muted">{caption} · </span>}
        <span className={cn("font-semibold tabular-nums", DATE_INK[tone])}>{date}</span>
        {withLabel && <span className="text-fg-secondary"> — {label}</span>}
      </span>
    </>
  );
  const cls = cn(
    // A pill, not a panel: shape and fill in separate strings.
    "inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-2xs",
    "bg-fill-soft",
    className,
  );
  if (!to) {
    return (
      <span className={cls} title={withLabel ? `${date} — ${label}` : date} lang={lang}>
        {body}
      </span>
    );
  }
  return (
    <Link
      to={to}
      title={withLabel ? `${date} — ${label}` : date}
      lang={lang}
      className={cn(
        cls,
        "transition-colors hover:border-line-strong hover:bg-fill focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60",
      )}
    >
      {body}
    </Link>
  );
}
