import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "one-night-ultimate-werewolf",
  title: "One Night Ultimate Werewolf",
  bggId: 147949,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
