import { Navigate, Route, Routes } from "react-router-dom";
import { TrainerScreen } from "../../games/quiztopia/components/trainer/TrainerScreen";
import { ExplorePage } from "./ExplorePage";
import { GeographyHub } from "./GeographyHub";
import { useGeoOfflineQueue } from "./offline-queue";
import { StudyPage } from "./study/StudyPage";

// World Geography — the second trainer next to Quiztopia's: an unmarked
// globe, continents → countries → cities, located by click and named by
// typing, scheduled by the shared spaced-repetition core.

export default function GeographyTrainer() {
  // Replays reviews queued offline as soon as the trainer opens.
  useGeoOfflineQueue();
  return (
    <TrainerScreen>
      <Routes>
        <Route index element={<GeographyHub />} />
        <Route path="study" element={<StudyPage />} />
        <Route path="explore" element={<ExplorePage />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Routes>
    </TrainerScreen>
  );
}
