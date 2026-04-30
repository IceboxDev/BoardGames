import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "7-wonders",
  title: "7 Wonders",
  bggId: 316377,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
