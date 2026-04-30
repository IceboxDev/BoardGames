import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "frosthaven",
  title: "Frosthaven",
  bggId: 295770,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
