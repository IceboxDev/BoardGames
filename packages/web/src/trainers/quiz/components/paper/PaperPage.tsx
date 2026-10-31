import { lazy, type ReactNode, Suspense, useMemo, useState } from "react";
import { cn } from "../../../../lib/cn";
import { todayKey } from "../../api";
import { useMyReports } from "../../hooks/useMyReports";
import { useTrainerPaths } from "../../paths";
import { type NavPage, TrainerNav } from "../trainer/TrainerNav";
import { Folio, Masthead } from "./Paper";
import { editionNumber, longDate } from "./paper-style";

// Every inside page of the paper in one frame: the compact masthead with the
// paper's links in its dateline, the page itself, and the folio at the foot.
// Inside pages scroll; only the front page is set to fit the screen.

// Loaded when first opened: it pulls in the review outbox.
const SettingsDrawer = lazy(() =>
  import("../trainer/SettingsDrawer").then((m) => ({ default: m.SettingsDrawer })),
);

export function PaperPage({
  pageLabel,
  folio,
  folioRight,
  current,
  fill = false,
  className,
  children,
}: {
  /** The dateline's page name: "The Archive", "Back issues" … */
  pageLabel: string;
  /** The folio's page number: "B1", "C1" … */
  folio: string;
  folioRight?: ReactNode;
  /** Which of the paper's links is this page. */
  current?: NavPage;
  /** Set to the screen on laptops: the page runs from masthead to folio, no scroll. */
  fill?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const paths = useTrainerPaths();
  const { unread } = useMyReports();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const today = useMemo(() => todayKey(), []);
  return (
    <div
      className={cn(
        "flex min-h-full flex-col px-4 pt-3 md:px-6 xl:px-10",
        fill && "lg:h-full lg:min-h-160",
      )}
    >
      <Masthead
        compact
        className="shrink-0"
        edition={`No. ${editionNumber(today)}`}
        dateLine={longDate(today)}
        pageLabel={pageLabel}
        homeTo={paths.hub}
        nav={
          <TrainerNav
            paths={paths}
            current={current}
            reportsUnread={unread}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        }
      />
      <main className={cn("flex flex-1 flex-col gap-6 py-5", fill && "lg:min-h-0", className)}>
        {children}
      </main>
      <Folio page={folio} right={folioRight} />
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsDrawer onClose={() => setSettingsOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
