import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "brass-pittsburgh",
  bggId: 452264,
  accentHex: accent.hex,
  family: { id: "brass", variant: "Pittsburgh" },
} satisfies GameModule;
