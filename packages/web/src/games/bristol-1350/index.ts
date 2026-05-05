import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "bristol-1350",
  title: "Bristol 1350",
  bggId: 308989,
  bgg,
  accentHex: accent.hex,
  family: { id: "dark-cities", variant: "Bristol 1350" },
} satisfies GameModule;
