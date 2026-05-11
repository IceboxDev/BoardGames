import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "frosthaven",
  bggId: 295770,
  accentHex: accent.hex,
  family: { id: "gloomhaven", variant: "Frosthaven" },
} satisfies GameModule;
