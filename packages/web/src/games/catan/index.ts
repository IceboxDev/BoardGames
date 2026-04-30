import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "catan",
  title: "Catan",
  bggId: 13,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
