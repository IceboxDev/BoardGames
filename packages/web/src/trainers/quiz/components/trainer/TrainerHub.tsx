import type { TrainerOverview } from "@boardgames/core/protocol";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QueryBoundary } from "../../../../components/ui";
import useDocumentTitle from "../../../../hooks/useDocumentTitle";
import { qk } from "../../../../lib/query-keys";
import { overviewQuery, queueQuery, todayKey } from "../../api";
import { useMyReports } from "../../hooks/useMyReports";
import { useQuizSettings } from "../../hooks/useQuizSettings";
import { useTrainerPaths } from "../../paths";
import { FrontPage } from "./FrontPage";
import { SettingsDrawer } from "./SettingsDrawer";
import { articlesToRead, studyAllPlan } from "./session-plan";
import { TrainerScreen } from "./TrainerScreen";

// The trainer's front door: today's edition as one newspaper front page that
// fills the screen and never scrolls on a laptop (FrontPage). The figures,
// study days, standings and corrections live on their own page, The Record.
// Everything hangs off one overview request; the queue — which articles
// today's edition brings — loads beside it.

export default function TrainerHub() {
  useDocumentTitle("Quiz · Trainer");
  const today = useMemo(() => todayKey(), []);
  const overview = useQuery({
    queryKey: qk.quizOverview(today),
    queryFn: overviewQuery(today),
    staleTime: 30_000,
  });
  return (
    <TrainerScreen>
      <QueryBoundary query={overview} loadingLabel="Counting what's due…">
        {(data) => <HubBody overview={data} today={today} />}
      </QueryBoundary>
    </TrainerScreen>
  );
}

function HubBody({ overview, today }: { overview: TrainerOverview; today: string }) {
  const navigate = useNavigate();
  const paths = useTrainerPaths();
  const { settings } = useQuizSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { unread: reportsUnread } = useMyReports();
  // Which articles today's edition brings: the same queue "Study all" deals.
  const queue = useQuery({
    queryKey: qk.quizQueue(null, today),
    queryFn: queueQuery({ today }),
    staleTime: 30_000,
  });
  const items = queue.data?.items ?? [];
  const reading = articlesToRead(items);
  const questionsOf = (articleId: string) =>
    items.filter((i) => i.articleId === articleId && i.tier === "new").length;

  return (
    <>
      <FrontPage
        overview={overview}
        plan={studyAllPlan(overview)}
        reading={reading}
        questionsOf={questionsOf}
        doneToday={queue.data?.doneToday ?? overview.todayCounts.reviews}
        today={today}
        lang={settings.language.primary}
        paths={paths}
        reportsUnread={reportsUnread}
        onStart={() => navigate(paths.study())}
        onMore={() => navigate(paths.study({ more: true }))}
        onReadArchive={() => navigate(paths.wiki)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {settingsOpen && <SettingsDrawer onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
