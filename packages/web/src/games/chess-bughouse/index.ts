import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "chess-bughouse",
  bggId: 0,
  accentHex: accent.hex,
  family: { id: "chess", variant: "Bughouse" },
} satisfies GameModule;
