import { lazy } from "react";
import type { PlayableModule } from "../types";

// Not a game — the DM's campaign tool. The mode picker shows the standard
// two cards: "DM Screen" (the tool itself, under solo/*) and the beamer/TTS
// companion for a second device pointed at the table. No server-side game
// machine exists for this slug.
// The three core rulebooks live in `public/rules/dnd/` (too large to run
// through the bundler as hashed assets) and render as tabs in the shared
// RulesViewer. They're also listed on the in-game Sources screen.
export const DND_RULEBOOKS = [
  { label: "Player's Handbook", url: "/rules/dnd/players-handbook.pdf" },
  { label: "Dungeon Master's Guide", url: "/rules/dnd/dungeon-masters-guide.pdf" },
  { label: "Monster Manual", url: "/rules/dnd/monster-manual.pdf" },
];

export default {
  component: lazy(() => import("./DndTool")),
  mode: "remote",
  soloLabel: "DM Screen",
  rulesUrl: DND_RULEBOOKS,
  companion: {
    label: "Beamer / TTS",
    description: "Attach a projector or voice device to the live table",
    component: lazy(() => import("./BeamerScreen")),
  },
} satisfies PlayableModule;
