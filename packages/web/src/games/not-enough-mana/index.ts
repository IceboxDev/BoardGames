import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "not-enough-mana",
  title: "Not Enough Mana",
  bggId: 343990,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
