import { type ComponentType, type LazyExoticComponent, lazy } from "react";
import type { PlayableModule, ReplayProps } from "../types";
// Shares chess's rules + credits document (Fairy-Stockfish is credited there).
import rulesUrl from "./assets/rules.pdf";

const replayComponent = lazy(() => import("./components/GameReplay")) as LazyExoticComponent<
  ComponentType<ReplayProps>
>;

export default {
  component: lazy(() => import("./Bughouse")),
  mode: "remote",
  soloLabel: "Play with bots",
  multiplayerDescription: "Four players, two boards, two teams — captures go to your partner.",
  rulesUrl,
  replayComponent,
  lobbyConfigComponent: lazy(() => import("./BughouseLobbyConfig")),
} satisfies PlayableModule;
