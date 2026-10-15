import { lazy } from "react";
import type { PlayableModule } from "../types";
import dungeonMastersGuideUrl from "./assets/dungeon-masters-guide.pdf";
import monsterManualUrl from "./assets/monster-manual.pdf";
import playersHandbookUrl from "./assets/players-handbook.pdf";

// Not a game — the DM's campaign tool for the physical table. The mode picker
// shows the Companion card (the tool, under solo/* — its hall also opens the
// beamer/TTS screen for a second device pointed at the table) and the
// Multiplayer card, disabled until online play exists. No server-side game
// machine exists for this slug.
// The three core rulebooks render as tabs in the shared RulesViewer and are
// also listed on the in-game Sources screen.
export const DND_RULEBOOKS = [
  { label: "Player's Handbook", url: playersHandbookUrl },
  { label: "Dungeon Master's Guide", url: dungeonMastersGuideUrl },
  { label: "Monster Manual", url: monsterManualUrl },
];

export default {
  component: lazy(() => import("./DndTool")),
  extraMode: "singleplayer",
  soloMode: "companion",
  multiplayerComingSoon: true,
  rulesUrl: DND_RULEBOOKS,
  matchHistoryComponent: lazy(() => import("./DndMatchHistory")),
} satisfies PlayableModule;
