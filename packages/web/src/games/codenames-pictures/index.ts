import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "codenames-pictures",
  title: "Codenames: Pictures",
  bggId: 198773,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
