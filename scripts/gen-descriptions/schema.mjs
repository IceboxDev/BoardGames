// Zod schema for OpenAI's structured output AND the JSON-schema shape we
// hand to the Responses API. Two views of the same contract:
//   - Zod validator (runtime, after the API responds).
//   - Plain JSON schema (sent to OpenAI as the structured-output spec).
// The char budgets here are the *hard* boundaries the model must respect.
// The carousel and catalog grid downstream clip with `line-clamp-N`, so any
// content over the upper bound either gets truncated mid-word (carousel) or
// silently ellipsizes (catalog) — both visible to the user. The lower bounds
// catch lazy outputs that wouldn't fill the surface.

import { z } from "zod";

// Upper bounds are deliberately ~15% above the prompt's "target" so the model
// has buffer to complete its final sentence cleanly. Without that buffer the
// API silently truncates strings at exactly maxLength, leaving mid-word cut
// endings in the committed source. The carousel/catalog renderers gate
// visible length via `line-clamp-N` anyway, so a slightly longer string only
// affects the file's appearance in git diff, not the user-facing layout.
export const GeneratedDescriptionsSchema = z.object({
  tight: z.string().min(80).max(200),
  default: z.string().min(160).max(300),
  loose: z.string().min(260).max(460),
  sources: z.array(z.string().url()).min(1).max(8),
});

// Plain JSON schema mirror — what we hand to OpenAI's `response_format`.
// Kept manual (not auto-derived from zod) so the schema we send is exactly
// what we expect, no spurious fields, no $ref indirection. OpenAI's strict
// mode requires `additionalProperties: false` and every property listed in
// `required`.
export const RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    tight: {
      type: "string",
      minLength: 80,
      maxLength: 200,
      description:
        "One complete sentence ending in a period. Target ~140 chars. Hook + core mechanic compressed. No win condition.",
    },
    default: {
      type: "string",
      minLength: 160,
      maxLength: 300,
      description:
        "Three complete sentences. Target ~240 chars. Hook, mechanic, win/twist. Carousel-sized.",
    },
    loose: {
      type: "string",
      minLength: 260,
      maxLength: 460,
      description:
        "Four complete sentences ending in a period. Target ~360 chars. Adds one concrete telling detail. Catalog-grid-sized.",
    },
    sources: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      // No `format: "uri"` here — OpenAI's strict mode rejects unknown
      // string formats. Post-parse Zod validation enforces URL shape.
      items: { type: "string" },
      description: "URLs actually read by web_search — not generic results.",
    },
  },
  required: ["tight", "default", "loose", "sources"],
};
