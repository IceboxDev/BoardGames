import { z } from "zod";
import { defineManifest } from "../../machines/manifest";

// Head-to-head race between two people; the solo Trainer runs in the browser
// and never reaches the server.
export const setManifest = defineManifest({
  slug: "set",
  seats: { min: 2, max: 2 },
  strategies: [],
  config: z.object({}),
});
