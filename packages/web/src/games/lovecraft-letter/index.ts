import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "lovecraft-letter",
  title: "Lovecraft Letter",
  bggId: 198740,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
