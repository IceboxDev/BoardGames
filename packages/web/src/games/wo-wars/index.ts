import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "wo-wars",
  title: "Where Was It?",
  bggId: 53279,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
