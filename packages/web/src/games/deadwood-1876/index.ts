import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "deadwood-1876",
  title: "Deadwood 1876",
  bggId: 245197,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
