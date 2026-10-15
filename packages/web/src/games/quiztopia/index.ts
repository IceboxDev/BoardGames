import { lazy } from "react";
import type { PlayableModule } from "../types";
import rulesUrl from "./assets/rules.pdf";

// Quiztopia: solo = the Trainer (flashcards + wiki), multiplayer = the co-op
// referee room. The engine forces `expert` off at one player and the room
// manager supplies playerCount/seats, so the lobby config only carries the
// four table options.
export default {
  component: lazy(() => import("./QuiztopiaGame")),
  extraMode: "singleplayer",
  soloMode: "trainer",
  rulesUrl,
  lobbyConfigComponent: lazy(() => import("./QuiztopiaLobbyConfig")),
} satisfies PlayableModule;
