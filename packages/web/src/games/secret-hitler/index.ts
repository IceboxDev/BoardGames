import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "secret-hitler",
  title: "Secret Hitler",
  bggId: 188834,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
