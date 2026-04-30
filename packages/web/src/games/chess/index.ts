import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "chess",
  title: "Chess",
  bggId: 171,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
