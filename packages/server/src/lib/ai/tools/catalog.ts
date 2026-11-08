import { CATALOG } from "@boardgames/core/games/catalog";
import { tool } from "ai";
import { z } from "zod";

// Tools agents may call (agent.ts). Each is read-only unless its name says
// otherwise, validates its input with zod, and returns plain JSON. Add a tool
// here, then hand it to an agent's `tools` — never give an agent a tool that
// writes without a human-visible reason in the feature that uses it.

/** Find catalog games by slug fragment: slug and six-trait skill weights. */
export const catalogLookup = tool({
  description:
    "Look up board games in the group's catalog by a fragment of their slug (e.g. 'codenames'). Returns up to 10 matches with their slug and six-trait skill weights.",
  inputSchema: z.object({
    query: z.string().min(2).max(60).describe("Part of a game slug, lowercase, hyphenated"),
  }),
  execute: async ({ query }) => {
    const q = query.trim().toLowerCase();
    const games = CATALOG.filter((g) => g.slug.includes(q))
      .slice(0, 10)
      .map((g) => ({ slug: g.slug, skills: g.skills }));
    return { count: games.length, games };
  },
});
