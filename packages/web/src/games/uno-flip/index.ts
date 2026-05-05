import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "uno-flip",
  title: "UNO Flip!",
  bggId: 271460,
  bgg,
  accentHex: accent.hex,
  family: { id: "uno", variant: "Flip" },
} satisfies GameModule;
