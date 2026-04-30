import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "brass-pittsburgh",
  title: "Brass: Pittsburgh",
  bggId: 452264,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
