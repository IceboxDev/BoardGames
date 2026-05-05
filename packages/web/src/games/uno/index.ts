import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "uno",
  title: "UNO",
  bggId: 2223,
  bgg,
  accentHex: accent.hex,
  family: { id: "uno", canonical: true, variant: "Classic" },
} satisfies GameModule;
