import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "hitster",
  title: "Hitster",
  bggId: 318243,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
