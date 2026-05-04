import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "gloomhaven",
  title: "Gloomhaven",
  bggId: 174430,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
