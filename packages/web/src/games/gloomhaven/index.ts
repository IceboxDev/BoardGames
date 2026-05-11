import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "gloomhaven",
  bggId: 174430,
  accentHex: accent.hex,
  family: { id: "gloomhaven", canonical: true, variant: "Original" },
} satisfies GameModule;
