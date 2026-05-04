import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "bandit",
  title: "Bandit",
  bggId: 450261,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
