import { Navigate, Route, Routes } from "react-router-dom";
import { useOfflineReviewQueue } from "../../hooks/useOfflineReviewQueue";
import { useTrainerPaths } from "../../paths";
import TimelinePage from "../timeline/TimelinePage";
import WikiArticle from "../wiki/WikiArticle";
import WikiCategory from "../wiki/WikiCategory";
import WikiIndex from "../wiki/WikiIndex";
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
//   wiki/:category             — one district's articles
//   wiki/:category/:cardId     — one article, answers highlighted
//
// Reviews that failed to reach the server while studying are replayed here
// on mount and whenever the browser comes back online.

export default function TrainerRoutes() {
  useOfflineReviewQueue();
  return (
    <Routes>
      <Route index element={<TrainerHub />} />
      <Route path="study" element={<StudySession />} />
      <Route path="timeline" element={<TimelinePage />} />
      <Route path="wiki" element={<WikiIndex />} />
      <Route path="wiki/search" element={<WikiSearch />} />
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
