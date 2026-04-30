import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "monopoly",
  title: "Monopoly",
  bggId: 1406,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
