import { lazy } from "react";
import type { PlayableModule } from "../types";

// Quiztopia: solo = the Trainer (flashcards + wiki), multiplayer = the co-op
// referee room. The engine forces `expert` off at one player and the room
// manager supplies playerCount/seats, so the lobby config only carries the
// four table options.
export default {
  component: lazy(() => import("./QuiztopiaGame")),
  mode: "remote",
  soloLabel: "Trainer",
  multiplayerDescription:
    "Co-op room for 1–6 — the app deals, hides answers and keeps score. A solo room is fine.",
  hasMatchHistory: true,
  matchHistoryOpponentLabel: "The dark side",
  rulesUrl: "/rules/quiztopia/spielregeln-2.0.pdf",
  lobbyConfigComponent: lazy(() => import("./QuiztopiaLobbyConfig")),
  defaultMpConfig: { difficulty: 0, expert: false, deck: "original", language: "en" },
} satisfies PlayableModule;
