import { lazy } from "react";
import type { PlayableModule } from "../types";

// Not a server-run game (yet) — the Storyteller companion is a purely
// client-side Grimoire that runs the physical table game. The mode picker
// shows "Companion" (the tool, under solo/*) and an inert Multiplayer card
// until online rooms are implemented. No server-side machine exists for this
// slug — see the D&D tool for the same pattern.
export default {
  component: lazy(() => import("./ClocktowerGame")),
  mode: "remote",
  soloLabel: "Companion",
  multiplayerComingSoon: true,
  rulesUrl: "/rules/blood-on-the-clocktower/main-rulebook.pdf",
} satisfies PlayableModule;
