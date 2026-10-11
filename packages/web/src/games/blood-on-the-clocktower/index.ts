import { lazy } from "react";
import type { PlayableModule } from "../types";
import rulesUrl from "./assets/rules.pdf";

// Not a server-run game (yet) — the Storyteller companion is a purely
// client-side Grimoire that runs the physical table game. The mode picker
// shows the Companion card (the tool, under solo/*) and the Multiplayer card,
// disabled until online rooms are implemented. No server-side machine exists
// for this slug — see the D&D tool for the same pattern.
export default {
  component: lazy(() => import("./ClocktowerGame")),
  soloMode: "companion",
  multiplayerComingSoon: true,
  rulesUrl,
  matchHistoryComponent: lazy(() => import("./ClocktowerMatchHistory")),
} satisfies PlayableModule;
