import { tournamentGameLogToHumanReadable } from "@boardgames/core/games/lost-cities/human-export";
import type { TournamentGameLog } from "@boardgames/core/games/lost-cities/tournament-log";
import { AI_ENGINE_LABELS } from "@boardgames/core/games/lost-cities/types";
import { type ComponentType, type LazyExoticComponent, lazy } from "react";
import type { GameModule, ReplayProps } from "../types";
import accent from "./accent.json";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";

// `GameReplay` is typed against `TournamentGameLog` internally; the
// shared `ReplayProps` contract types `game` as `unknown` so the
// registry can hold replay components for every game's log shape under
// one type. Casting at the lazy() boundary keeps the per-game
// component free of `unknown` plumbing while making the registry
// uniformly typed.
const replayComponent = lazy(() => import("./components/GameReplay")) as LazyExoticComponent<
  ComponentType<ReplayProps>
>;

export default {
  slug: "lost-cities",
  bggId: 50,
  accentHex: accent.hex,
  backgroundImage,
  component: lazy(() => import("./LostCities")),
  mode: "remote",
  hasMatchHistory: true,
  hasTournament: true,
  tournamentStrategies: [
    { id: "ismcts-v6", label: "Adaptive+" },
    { id: "ismcts-v5", label: "Adaptive" },
    { id: "ismcts-v4", label: "Strict" },
    { id: "ismcts-v1", label: "Baseline" },
  ],
  rulesUrl,
  replayComponent,
  matchHistoryLabelResolver: (id) => AI_ENGINE_LABELS[id as keyof typeof AI_ENGINE_LABELS] ?? id,
  tournamentExportLogFn: (g) => tournamentGameLogToHumanReadable(g as TournamentGameLog),
} satisfies GameModule;
