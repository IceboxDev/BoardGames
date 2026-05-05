import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "codenames",
  title: "Codenames",
  bggId: 178900,
  bgg,
  accentHex: accent.hex,
  family: { id: "codenames", canonical: true, variant: "Original" },
} satisfies GameModule;
