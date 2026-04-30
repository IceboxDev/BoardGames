import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "dungeon-mayhem",
  title: "Dungeon Mayhem",
  bggId: 260300,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
