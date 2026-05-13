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

// Upper bounds are generous to give the model real sentence-completion
// buffer. The API's strict-mode `maxLength` is a HARD server-side cap: when
// generation exceeds it, the string is silently truncated mid-word. So we
// set maxLength well above the prompt's target (~50% margin) and rely on the
// prompt to actually steer length. The carousel uses `line-clamp-7` as a
// safety; at the smallest non-compact card width (cardW=280, desc width
// ~240px, text-[10px] ≈ 5px/char → ~48 chars/line) the visible budget is
// ~336 chars, so a `default` near 320 still renders cleanly.
//
// `loose` renders in the catalog grid with `line-clamp-6 text-sm` and is
// expected to ellipsize on the 6th line, so its cap is the most generous.
// Sentence-completion guard: every variant must end with terminal punctuation
// (`.`, `?`, `!`) optionally followed by a closing quote. The API's strict
// maxLength is a hard server-side cap; when the model wants to write more,
// it cuts mid-word and the unfinished string sneaks past simple min/max
// validators. This regex catches those cases so the existing schema-failure
// retry in openai-call.mjs runs a second attempt with a reminder.
const endsWithSentenceTerminator = /[.?!][")”’]?$/u;
const completeSentence = (label) =>
  z
    .string()
    .refine((s) => endsWithSentenceTerminator.test(s.trim()), {
      message: `${label} must end with a sentence terminator (., ?, !) — yours appears to have been cut off mid-sentence`,
    });

export const GeneratedDescriptionsSchema = z.object({
  tight: completeSentence("tight").pipe(z.string().min(80).max(220)),
  default: completeSentence("default").pipe(z.string().min(160).max(340)),
  loose: completeSentence("loose").pipe(z.string().min(280).max(560)),
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
      maxLength: 220,
      description:
        "One complete sentence ending in a period. Target ~130 chars; do not write more than ~160. Genre + how-you-play compressed.",
    },
    default: {
      type: "string",
      minLength: 160,
      maxLength: 340,
      description:
        "Three complete sentences ending with a period. Target ~220 chars; do not write more than ~280. Sentence 1: genre + core loop. Sentence 2: a turn or round. Sentence 3: win condition.",
    },
    loose: {
      type: "string",
      minLength: 280,
      maxLength: 560,
      description:
        "Four complete sentences ending with a period. Target ~380 chars; do not write more than ~460. Adds one concrete telling detail (component, signature moment, designer fact, expansion etc).",
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
