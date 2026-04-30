import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "keltis",
  title: "Keltis",
  bggId: 34585,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
