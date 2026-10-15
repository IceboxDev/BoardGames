import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { BoardFallback } from "../../components/RouteFallback";
import type { GameComponentProps } from "../types";
import Companion from "./companion/Companion";

const OnlineClocktower = lazy(() => import("./online/OnlineClocktower"));

/**
 * Blood on the Clocktower: the Companion card opens the Storyteller companion
 * for a table game (`/play/blood-on-the-clocktower/solo`), Singleplayer the
 * online game against stand-in bots (`solo/bots`); rooms play online.
 */
export default function ClocktowerGame({ source }: GameComponentProps) {
  const online = (
    <Suspense fallback={<BoardFallback />}>
      <OnlineClocktower source={source} />
    </Suspense>
  );
  if (source !== "solo") return online;
  return (
    <Routes>
      <Route path="bots" element={online} />
      <Route path="*" element={<Companion />} />
    </Routes>
  );
}
