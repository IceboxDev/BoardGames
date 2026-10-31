import type { ReactNode } from "react";
import { Badge } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { type DomainTone, domainOf, TONE_MARK } from "../../domains";

// The answer, highlighted inside its article sentence. Static in the study
// snippet; interactive on the wiki page, where each mark carries its
// question number and expands the matching question row. The `print`
// variant is the newspaper's: the answer underlined in its section's ink.

type Props = {
  tone: DomainTone;
  children: ReactNode;
  /** "Q3" superscript on the interactive variant. */
  label?: string;
  /** Tooltip — the question this answer belongs to. */
  question?: string;
  active?: boolean;
  onClick?: () => void;
  variant?: "tint" | "print";
  /** The section whose ink underlines a `print` mark. */
  domain?: string;
};

export function AnswerMark({
  tone,
  children,
  label,
  question,
  active,
  onClick,
  variant = "tint",
  domain,
}: Props) {
  const print = variant === "print";
  const classes = print
    ? cn(
        "bg-transparent font-semibold text-fg-strong underline decoration-2 underline-offset-4",
        active && "bg-fill",
      )
    : cn(
        "rounded-ui-md px-0.5 font-medium text-fg-strong",
        TONE_MARK[tone],
        active && "ring-1 ring-fg-strong/40",
      );
  const style = print ? { textDecorationColor: domainOf(domain).color } : undefined;
  if (!onClick) {
    return (
      <mark className={classes} style={style}>
        {children}
      </mark>
    );
  }
  return (
    // biome-ignore lint/correctness/noRestrictedElements: an inline mark inside running prose — Button's chrome would break the text flow.
    <button
      type="button"
      onClick={onClick}
      title={question}
      aria-expanded={active}
      style={style}
      className={cn(
        classes,
        "cursor-pointer align-baseline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg-strong/40",
      )}
    >
      {children}
      {label && print && (
        <sup className="ml-0.5 font-news text-3xs font-semibold text-fg-muted">{label}</sup>
      )}
      {label && !print && (
        <Badge tone={tone} size="xs" className="ml-0.5 align-super">
          {label}
        </Badge>
      )}
    </button>
  );
}
