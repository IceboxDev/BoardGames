import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "uno-flip",
  bggId: 271460,
  accentHex: accent.hex,
  family: { id: "uno", variant: "Flip" },
} satisfies GameModule;
