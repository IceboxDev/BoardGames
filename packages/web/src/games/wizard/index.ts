import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "wizard",
  title: "Wizard",
  bggId: 1465,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
