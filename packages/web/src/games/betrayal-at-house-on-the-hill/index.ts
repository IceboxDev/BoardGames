import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "betrayal-at-house-on-the-hill",
  title: "Betrayal at House on the Hill",
  bggId: 10547,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
