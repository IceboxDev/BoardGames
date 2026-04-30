import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "wer-wars",
  title: "Who Was It?",
  bggId: 33643,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
