import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "just-one",
  title: "Just One",
  bggId: 254640,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
