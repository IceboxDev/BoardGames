import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "salem-1692",
  title: "Salem 1692",
  bggId: 175549,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
