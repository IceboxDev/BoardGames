import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "liars-uno",
  title: "Liars UNO",
  bggId: 455524,
  bgg,
  accentHex: accent.hex,
  family: { id: "uno", variant: "Liars" },
} satisfies GameModule;
