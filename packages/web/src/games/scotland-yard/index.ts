import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "scotland-yard",
  title: "Scotland Yard",
  bggId: 438,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
