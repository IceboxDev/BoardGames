import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "codenames-duet",
  bggId: 224037,
  accentHex: accent.hex,
  family: { id: "codenames", variant: "Duet" },
} satisfies GameModule;
