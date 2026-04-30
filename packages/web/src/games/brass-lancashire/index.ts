import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "brass-lancashire",
  title: "Brass: Lancashire",
  bggId: 28720,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
