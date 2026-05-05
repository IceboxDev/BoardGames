import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "uno-show-em-no-mercy",
  title: "UNO Show 'Em No Mercy",
  bggId: 399088,
  bgg,
  accentHex: accent.hex,
  family: { id: "uno", variant: "Show 'Em No Mercy" },
} satisfies GameModule;
