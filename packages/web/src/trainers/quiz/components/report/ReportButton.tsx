import { type MouseEvent, useState } from "react";
import { FlagIcon } from "../../../../components/icons";
import { Button, IconButton } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { useMyReports } from "../../hooks/useMyReports";
import { type ReportContext, ReportDialog } from "./ReportDialog";

// The flag on every question and article. Quiet until used: a ghost icon
// (or "Report a problem" where there's room). Once you've reported the
// target it reads "Reported" in amber — and reopens your report, so you can
// add to it or withdraw it instead of filing it twice.
//
// Clicks stop here: on the study card the flag sits on top of the
// full-card "tap to reveal" overlay, and a report must never flip the card.

type Props = {
  context: ReportContext;
  /** `icon` (default) for rows and cards; `labelled` where there's room. */
  variant?: "icon" | "labelled";
  /** The labelled variant's words (default "Report a problem"). */
  label?: string;
  className?: string;
};

export function ReportButton({
  context,
  variant = "icon",
  label = "Report a problem",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const { openFor } = useMyReports();
  const reported = openFor(context.target.id).length > 0;
  const what = context.target.kind === "question" ? "question" : "article";

  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    setOpen(true);
  };

  return (
    <>
      {reported ? (
        <Button
          variant="tinted"
          tone="amber"
          size="xs"
          onClick={onClick}
          className={cn("relative z-raised", className)}
          title={`You reported a problem with this ${what} — open your report`}
        >
          <FlagIcon className="h-3 w-3" />
          Reported
        </Button>
      ) : variant === "labelled" ? (
        <Button
          variant="ghost"
          size="xs"
          onClick={onClick}
          className={cn("relative z-raised", className)}
          title={`Report a problem with this ${what}`}
        >
          <FlagIcon className="h-3 w-3" />
          {label}
        </Button>
      ) : (
        <IconButton
          variant="ghost"
          size="xs"
          icon={<FlagIcon className="h-3.5 w-3.5" />}
          aria-label={`Report a problem with this ${what}`}
          title={`Report a problem with this ${what}`}
          onClick={onClick}
          className={cn("relative z-raised", className)}
        />
      )}
      {open && <ReportDialog context={context} onClose={() => setOpen(false)} />}
    </>
  );
}
