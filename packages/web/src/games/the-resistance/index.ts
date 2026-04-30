import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "the-resistance",
  title: "The Resistance",
  bggId: 41114,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
