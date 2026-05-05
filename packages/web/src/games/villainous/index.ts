import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "villainous",
  title: "Disney Villainous: The Worst Takes It All",
  bggId: 256382,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
