import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "elements-of-truth",
  title: "Elements of Truth",
  bggId: 0,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
