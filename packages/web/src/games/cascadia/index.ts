import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "cascadia",
  title: "Cascadia",
  bggId: 295947,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
