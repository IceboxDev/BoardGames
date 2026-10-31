import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  BookIcon,
  ClockIcon,
  GearIcon,
  PinIcon,
  ScoreSheetIcon,
} from "../../../../components/icons";
import { IconButton } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import type { TrainerPaths } from "../../paths";
import { KICKER } from "../paper/paper-style";
import { UnreadDot } from "../report/UnreadDot";

// The paper's own links, set at the right end of the masthead's dateline:
// the archive, back issues (the journal), the timeline, the record (stats)
// and the settings gear. Icons only on phones; the current page stays in
// place, underlined, so the links never shift between pages.

export type NavPage = "front" | "record" | "archive" | "journal" | "timeline";

export function TrainerNav({
  paths,
  current,
  reportsUnread = 0,
  onOpenSettings,
}: {
  paths: TrainerPaths;
  current?: NavPage;
  reportsUnread?: number;
  onOpenSettings?: () => void;
}) {
  return (
    <>
      <NavLink
        to={paths.wiki}
        label="Archive"
        icon={<BookIcon className="size-3.5" />}
        unread={reportsUnread}
        active={current === "archive"}
      />
      <NavLink
        to={paths.journal}
        label="Back issues"
        icon={<ClockIcon className="size-3.5" />}
        active={current === "journal"}
      />
      <NavLink
        to={paths.timeline()}
        label="Timeline"
        icon={<PinIcon className="size-3.5" />}
        active={current === "timeline"}
      />
      <NavLink
        to={paths.record}
        label="The Record"
        icon={<ScoreSheetIcon className="size-3.5" />}
        active={current === "record"}
      />
      {onOpenSettings && (
        <IconButton
          variant="ghost"
          size="sm"
          aria-label="Trainer settings"
          onClick={onOpenSettings}
          icon={<GearIcon className="size-4" />}
        />
      )}
    </>
  );
}

function NavLink({
  to,
  icon,
  unread = 0,
  label,
  active = false,
}: {
  to: string;
  icon: ReactNode;
  unread?: number;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        KICKER,
        "relative flex h-7 items-center gap-1.5 rounded-ui-md px-2 text-fg-primary hover:bg-fill hover:text-fg-strong focus-visible:outline-2 focus-visible:outline-accent-400",
        active && "text-accent-300",
      )}
    >
      {icon}
      <span
        className={cn(
          "hidden lg:inline",
          active && "underline decoration-accent-300 underline-offset-4",
        )}
      >
        {label}
      </span>
      <UnreadDot count={unread} />
    </Link>
  );
}
