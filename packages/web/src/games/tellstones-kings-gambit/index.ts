import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "tellstones-kings-gambit",
  title: "Tellstones: King's Gambit",
  bggId: 298477,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
