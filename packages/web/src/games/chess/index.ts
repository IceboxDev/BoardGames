import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "chess",
  bggId: 171,
  accentHex: accent.hex,
  family: { id: "chess", canonical: true, variant: "Classical" },
} satisfies GameModule;
