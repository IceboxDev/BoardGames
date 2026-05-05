import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "chess-bughouse",
  title: "Chess Bughouse",
  bggId: 0,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
