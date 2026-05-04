import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "targi",
  title: "Targi",
  bggId: 118048,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
