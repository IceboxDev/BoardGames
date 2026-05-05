import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "chess-for-three",
  title: "Chess for Three",
  bggId: 27339,
  bgg,
  accentHex: accent.hex,
  family: { id: "chess", variant: "For Three" },
} satisfies GameModule;
