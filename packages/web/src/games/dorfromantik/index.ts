import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "dorfromantik",
  title: "Dorfromantik",
  bggId: 370591,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
