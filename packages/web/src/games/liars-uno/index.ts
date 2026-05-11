import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "liars-uno",
  bggId: 455524,
  accentHex: accent.hex,
  family: { id: "uno", variant: "Liars" },
} satisfies GameModule;
