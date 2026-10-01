import { Navigate, Route, Routes } from "react-router-dom";
import { SOLVER_BASE } from "../../logic/solver";
import MatchAnalysis from "./MatchAnalysis";
import SolverHub from "./SolverHub";
import TableEntry from "./TableEntry";

// The Solver's routes under `/play/the-resistance/solo/*`:
//
//   .                — the hub: new tabletop game, saved tables, online matches
//   table/:id        — enter a tabletop game by hand, analysed as you go
//   match/:replayId  — a finished online match, analysed

export default function SolverRoutes() {
  return (
    <Routes>
      <Route index element={<SolverHub />} />
      <Route path="table/:id" element={<TableEntry />} />
      <Route path="match/:replayId" element={<MatchAnalysis />} />
      <Route path="*" element={<Navigate to={SOLVER_BASE} replace />} />
    </Routes>
  );
}
