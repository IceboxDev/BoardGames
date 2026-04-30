import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "rummikub",
  title: "Rummikub",
  bggId: 811,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
