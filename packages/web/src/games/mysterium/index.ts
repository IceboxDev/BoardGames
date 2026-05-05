import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "mysterium",
  title: "Mysterium",
  bggId: 181304,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
