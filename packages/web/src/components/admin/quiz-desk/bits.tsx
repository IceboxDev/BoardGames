import type { QuizDeskTargetLabel } from "@boardgames/core/protocol/http/quiz-desk";
import type { BacklogItem } from "@boardgames/core/quiz/backlog-types";
import type { ReactNode } from "react";
import { cn } from "../../../lib/cn";
import { archiveHref, archiveLabel, runHref } from "../../../trainers/quiz/logic/archive-links";
import { Badge, Button, MicroLabel } from "../../ui";
import { hostOf, PRIORITY_TONE, STATUS_TONE } from "./logic";

// Small pieces the desk's tabs share: an external link, an archive / run
// link, a backlog target's label (opening the article's provenance) and a
// backlog item row.

export function ExternalLink({
  href,
  children,
  title,
  className,
}: {
  href: string;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={cn(
        "inline-flex min-w-0 items-center gap-0.5 text-xs text-accent-300 transition-colors hover:text-accent-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60",
        className,
      )}
    >
      <span className="truncate">{children}</span>
      <span aria-hidden="true">↗</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** An in-desk jump (open an article's provenance) in the accent ink. */
export function DeskLinkButton({
  onClick,
  title,
  className,
  children,
}: {
  onClick: () => void;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Button
      variant="link"
      align="start"
      onClick={onClick}
      title={title}
      className={cn(
        "min-w-0 max-w-full text-left text-accent-300 hover:text-accent-200",
        className,
      )}
    >
      <span className="min-w-0 truncate">{children}</span>
    </Button>
  );
}

/** A `quiz-archive/…` path or URL as a link; plain text when it has no home. */
export function RefLink({ refText }: { refText: string }) {
  const href = archiveHref(refText);
  if (!href) return <span className="text-xs text-fg-muted">{refText}</span>;
  const label = /^https?:/.test(refText) ? hostOf(refText) : archiveLabel(refText);
  return (
    <ExternalLink href={href} title={refText}>
      {label}
    </ExternalLink>
  );
}

export function RunLink({ id, title }: { id: string; title?: string | null }) {
  return (
    <ExternalLink href={runHref(id)} title={title ?? id}>
      run {id}
    </ExternalLink>
  );
}

/** A backlog target in words; the article's provenance one click away. */
export function TargetLabel({
  target,
  label,
  onOpenArticle,
}: {
  target: string;
  label: QuizDeskTargetLabel | undefined;
  onOpenArticle?: (articleId: string) => void;
}) {
  const text = label?.label ?? target;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <MicroLabel className="shrink-0">{target}</MicroLabel>
      {label?.articleId && onOpenArticle ? (
        <DeskLinkButton
          onClick={() => label.articleId && onOpenArticle(label.articleId)}
          className={cn("text-sm", label.retired && "line-through decoration-fg-muted/60")}
          title={`Open the provenance of ${label.articleId}`}
        >
          {text}
        </DeskLinkButton>
      ) : (
        <span
          className={cn(
            "min-w-0 truncate text-sm text-fg-primary",
            label?.retired && "line-through decoration-fg-muted/60",
          )}
        >
          {text}
        </span>
      )}
      {label?.retired && (
        <Badge tone="rose" size="xs">
          retired
        </Badge>
      )}
    </span>
  );
}

export function BacklogRow({
  item,
  label,
  onOpenArticle,
}: {
  item: BacklogItem;
  label: QuizDeskTargetLabel | undefined;
  onOpenArticle?: (articleId: string) => void;
}) {
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={PRIORITY_TONE[item.priority] ?? "neutral"} size="xs" title="Priority">
          P{item.priority}
        </Badge>
        <Badge tone={STATUS_TONE[item.status]} size="xs">
          {item.status}
        </Badge>
        <Badge tone="neutral" size="xs">
          {item.kind}
        </Badge>
        <MicroLabel className="tabular-nums">{item.id}</MicroLabel>
        <MicroLabel className="ml-auto tabular-nums">
          {item.created} · {item.by}
        </MicroLabel>
      </div>
      <TargetLabel target={item.target} label={label} onOpenArticle={onOpenArticle} />
      {item.notes && (
        <p className="text-xs leading-snug whitespace-pre-line text-fg-secondary">{item.notes}</p>
      )}
      {(item.links.length > 0 || item.run || item.closedBy || item.closeReason) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {item.links.map((l) => (
            <RefLink key={l} refText={l} />
          ))}
          {item.run && <RunLink id={item.run} />}
          {item.closedBy && (
            <MicroLabel>
              closed by {item.closedBy}
              {item.closedAt ? ` · ${item.closedAt}` : ""}
            </MicroLabel>
          )}
          {item.closeReason && (
            <span className="text-xs text-fg-muted">won't fix: {item.closeReason}</span>
          )}
        </div>
      )}
    </li>
  );
}
