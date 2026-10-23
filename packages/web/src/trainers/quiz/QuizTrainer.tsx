import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { RouteFallback } from "../../components/RouteFallback";
import TimelinePage from "./components/timeline/TimelinePage";
import StudySession from "./components/trainer/StudySession";
import TrainerHub from "./components/trainer/TrainerHub";
import WikiArticle from "./components/wiki/WikiArticle";
import WikiDomain from "./components/wiki/WikiDomain";
import WikiIndex from "./components/wiki/WikiIndex";
import WikiJournal from "./components/wiki/WikiJournal";
import WikiReports from "./components/wiki/WikiReports";
import WikiSearch from "./components/wiki/WikiSearch";
import { useQuizIndex } from "./hooks/useContent";
import { useTrainerPaths } from "./paths";
import { useQuizOutbox } from "./review-outbox";

// The quiz trainer: one programme over every game's questions (Quiztopia,
// Trivial Pursuit, …), studied by domain. Nested routes under
// `/trainer/quiz/*` — the top nav's back button unwinds screen by screen:
//
//   .                          — the hub (today, the domains)
//   study?domain|article|ids   — a study session
//   timeline?q=                — the personal timeline of every studied fact
//   wiki                       — the archive's domains
//   wiki/search?q=             — full-text search
//   wiki/journal               — every day's studied facts and reads
//   wiki/reports               — your content reports and their outcomes
//   wiki/article/:articleId    — one article, answers highlighted
//   wiki/fact/:factId          — redirects to the fact's passage in its article
//   wiki/:domain               — one domain's articles
//
// Reviews that failed to reach the server while studying are replayed while
// any trainer screen is open: on mount, on reconnect, when the tab becomes
// visible again and on a backoff timer (`review-outbox.ts`).

export default function QuizTrainer() {
  useQuizOutbox();
  return (
    <Routes>
      <Route index element={<TrainerHub />} />
      <Route path="study" element={<StudySession />} />
      <Route path="timeline" element={<TimelinePage />} />
      <Route path="wiki" element={<WikiIndex />} />
      <Route path="wiki/search" element={<WikiSearch />} />
      <Route path="wiki/journal" element={<WikiJournal />} />
      <Route path="wiki/reports" element={<WikiReports />} />
      <Route path="wiki/article/:articleId" element={<WikiArticle />} />
      <Route path="wiki/fact/:factId" element={<FactRedirect />} />
      <Route path="wiki/:domain" element={<WikiDomain />} />
      <Route path="*" element={<FallbackToHub />} />
    </Routes>
  );
}

/** A link that only knows the fact (the table game's log) lands on its passage. */
function FactRedirect() {
  const { factId = "" } = useParams();
  const paths = useTrainerPaths();
  const index = useQuizIndex();
  if (!index.data) return <RouteFallback />;
  const article = index.data.articleOf(factId);
  return <Navigate to={article ? paths.wikiArticle(article.id, factId) : paths.wiki} replace />;
}

function FallbackToHub() {
  const paths = useTrainerPaths();
  return <Navigate to={paths.hub} replace />;
}
