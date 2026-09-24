import type { ReactNode } from "react";
import { Badge } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { type BandTone, TONE_MARK } from "../../bands";

// The answer, highlighted inside its article sentence. Static in the study
// snippet; interactive on the wiki page, where each mark carries its
// question number and expands the matching question row.

type Props = {
  tone: BandTone;
  children: ReactNode;
  /** "Q3" superscript on the interactive variant. */
  label?: string;
  /** Tooltip — the question this answer belongs to. */
  question?: string;
  active?: boolean;
  onClick?: () => void;
};

export function AnswerMark({ tone, children, label, question, active, onClick }: Props) {
  const classes = cn(
    "rounded-ui-md px-0.5 font-medium text-fg-strong",
    TONE_MARK[tone],
    active && "ring-1 ring-fg-strong/40",
  );
  if (!onClick) return <mark className={classes}>{children}</mark>;
  return (
    // biome-ignore lint/correctness/noRestrictedElements: an inline mark inside running prose — Button's chrome would break the text flow.
    <button
      type="button"
      onClick={onClick}
      title={question}
      aria-expanded={active}
      className={cn(
        classes,
        "cursor-pointer align-baseline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg-strong/40",
      )}
    >
      {children}
      {label && (
        <Badge tone={tone} size="xs" className="ml-0.5 align-super">
          {label}
        </Badge>
      )}
    </button>
  );
}
