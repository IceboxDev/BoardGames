import { Navigate, Route, Routes } from "react-router-dom";
import { useTrainerPaths } from "../../paths";
import { useQuiztopiaOutbox } from "../../review-outbox";
import TimelinePage from "../timeline/TimelinePage";
import WikiArticle from "../wiki/WikiArticle";
import WikiCategory from "../wiki/WikiCategory";
import WikiIndex from "../wiki/WikiIndex";
import WikiJournal from "../wiki/WikiJournal";
import WikiSearch from "../wiki/WikiSearch";
import StudySession from "./StudySession";
import TrainerHub from "./TrainerHub";

// The trainer's nested routes under `/play/quiztopia/solo/*` (the D&D tool
// pattern — the top nav's back button unwinds screen by screen):
//
//   .                          — the hub (the city, today, districts)
//   study?category|set|ids     — a study session
//   timeline?q=                — the personal timeline of every studied question
//   wiki                       — the archive's districts
//   wiki/search?q=             — full-text search
//   wiki/journal               — every day's studied questions and reads
//   wiki/:category             — one district's articles
//   wiki/:category/:cardId     — one article, answers highlighted
//
// Reviews that failed to reach the server while studying are replayed while
// any trainer screen is open: on mount, on reconnect, when the tab becomes
// visible again and on a backoff timer (`review-outbox.ts`).

export default function TrainerRoutes() {
  useQuiztopiaOutbox();
  return (
    <Routes>
      <Route index element={<TrainerHub />} />
      <Route path="study" element={<StudySession />} />
      <Route path="timeline" element={<TimelinePage />} />
      <Route path="wiki" element={<WikiIndex />} />
      <Route path="wiki/search" element={<WikiSearch />} />
      <Route path="wiki/journal" element={<WikiJournal />} />
      <Route path="wiki/:category" element={<WikiCategory />} />
      <Route path="wiki/:category/:cardId" element={<WikiArticle />} />
      <Route path="*" element={<FallbackToHub />} />
    </Routes>
  );
}

function FallbackToHub() {
  const paths = useTrainerPaths();
  return <Navigate to={paths.hub} replace />;
}
