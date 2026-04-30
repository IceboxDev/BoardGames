import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "skip-bo",
  title: "Skip-Bo",
  bggId: 1269,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
