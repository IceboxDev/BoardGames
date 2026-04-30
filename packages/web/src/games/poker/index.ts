import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "poker",
  title: "Poker",
  bggId: 1115,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
