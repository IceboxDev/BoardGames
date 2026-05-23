// Runtime schema for `catalog.json`. The catalog is committed in the
// repo and only ever edited by humans, but a typo on a hot path is
// worse than a loud crash at registry bootstrap — so we Zod-validate
// the whole thing once at module load and let TypeScript narrow
// downstream consumers.
//
// The schema lives next to `types.ts` so the inferred type stays in
// lockstep with `CatalogEntry`. If they ever drift, the failed
// `satisfies CatalogEntry` assertion at the bottom of this file is
// the first thing a developer sees.

import { BggGameSchema, GameSlugSchema } from "@boardgames/core/protocol";
import { z } from "zod";
import type { CatalogEntry } from "./types";

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const GameFamilySchema = z.object({
  id: z.string().min(1),
  canonical: z.boolean().optional(),
  name: z.string().min(1).optional(),
  variant: z.string().min(1),
});

export const CatalogEntrySchema = z
  .object({
    slug: GameSlugSchema,
    bggId: z.number().int().min(0),
    accentHex: z.string().regex(HEX_COLOR_RE, "accentHex must be #rrggbb"),
    family: GameFamilySchema.optional(),
    displayTitle: z.string().min(1).optional(),
    bggOverrides: BggGameSchema.partial().optional(),
    isNew: z.boolean().optional(),
  })
  // Reject unknown fields rather than silently dropping them — catches
  // typos like `tournamentStrategies: [...]` accidentally landing in
  // catalog.json instead of a playable index.ts.
  .strict();

export const CatalogSchema = z.array(CatalogEntrySchema);

// Compile-time check: `CatalogEntry` and the schema's inferred type
// must agree. If this satisfies-clause fails, update both in tandem.
type _AssertCatalogEntry =
  z.infer<typeof CatalogEntrySchema> extends CatalogEntry
    ? CatalogEntry extends z.infer<typeof CatalogEntrySchema>
      ? true
      : never
    : never;
const _entryShapesAgree: _AssertCatalogEntry = true;
void _entryShapesAgree;
