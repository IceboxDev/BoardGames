import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "uno",
  bggId: 2223,
  accentHex: accent.hex,
  family: { id: "uno", canonical: true, variant: "Classic" },
} satisfies GameModule;
