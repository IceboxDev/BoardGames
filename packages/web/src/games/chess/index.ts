import { type ComponentType, type LazyExoticComponent, lazy } from "react";
import type { PlayableModule, ReplayProps } from "../types";
// Rules + credits (Stockfish GPL-3.0, cburnett CC BY-SA). Source: assets/rules-source.html,
// printed to PDF with headless Chromium.
import rulesUrl from "./assets/rules.pdf";

// The replay viewer parses its log with `ChessReplayLogSchema`; the shared
// contract types `game` as `unknown`, so the lazy boundary is where the
// per-game component meets the registry's one type.
const replayComponent = lazy(() => import("./components/GameReplay")) as LazyExoticComponent<
  ComponentType<ReplayProps>
>;

export default {
  component: lazy(() => import("./Chess")),
  mode: "remote",
  soloLabel: "Play vs Stockfish",
  multiplayerDescription: "Play a friend — pick a time control, swap seats to choose colours.",
  rulesUrl,
  replayComponent,
  lobbyConfigComponent: lazy(() => import("./ChessLobbyConfig")),
} satisfies PlayableModule;
