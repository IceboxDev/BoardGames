// The Codenames Companion's grid scan: one table photo → the 25 words, for a
// player sitting too far from the cards to read them
// (`web/src/games/codenames/companion/`). One vision call through
// `structuredGenerate` (the AI ledger records it); the photo is never stored.

import {
  type CodenamesScanResponse,
  CodenamesScanResponseSchema,
  GRID_CELLS,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { structuredGenerate } from "./ai";

const SCAN_BUDGET_MS = 45_000;

export const SCAN_PROMPT = `This photo shows a game of Codenames on a table: 25 word cards laid out in a 5×5 grid. Read the grid.

- Give the 25 cards row by row, starting at the top-left as seen from the camera, left to right, then the next row down. If the grid is turned, follow its rows and columns as they lie, starting from the corner nearest the camera's top-left.
- Each card prints its word twice, once upside down: read the one that is upright from the camera, else either — it is the same word.
- The words are English or German. Write each word exactly as printed, in capitals, keeping umlauts (Ä Ö Ü) and ß. Never translate or correct a word into another one.
- A card may lie under a coloured cover card: red agent → "red", blue agent → "blue", a beige/tan bystander → "bystander". Give the cover; the word is "" when the cover hides it. A card with no cover has cover null.
- sure is false whenever you are not confident of a word (blurred, glare, cut off, partly hidden).
- language: "en" or "de" for the cards' language, null if you can't tell.
- If the photo does not show a Codenames grid you can read, or you cannot find all 25 positions, explain in one short sentence in problem and leave cells empty. Otherwise problem is null.`;

const SCAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["problem", "language", "cells"],
  properties: {
    problem: { type: ["string", "null"] },
    // anyOf, not a nullable enum: Anthropic rejects `enum` beside `type: [..., "null"]`.
    language: { anyOf: [{ type: "string", enum: ["en", "de"] }, { type: "null" }] },
    cells: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["word", "sure", "cover"],
        properties: {
          word: { type: "string" },
          sure: { type: "boolean" },
          cover: {
            anyOf: [{ type: "string", enum: ["red", "blue", "bystander"] }, { type: "null" }],
          },
        },
      },
    },
  },
} as const;

/** The model's answer, loosely: anything it got wrong becomes a `ScanProblem`. */
const RawScanSchema = z.object({
  problem: z.string().nullable(),
  language: z.enum(["en", "de"]).nullable().catch(null),
  cells: z.array(
    z.object({
      word: z.string(),
      sure: z.boolean(),
      cover: z.enum(["red", "blue", "bystander"]).nullable().catch(null),
    }),
  ),
});

/** The photo couldn't be read as a grid — said to the player as is. */
export class ScanProblem extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScanProblem";
  }
}

/** One printed word, tidied: trimmed, single-spaced, capitals kept as printed (ß stays ß). */
export function tidyWord(word: string): string {
  return word.replace(/\s+/g, " ").trim().slice(0, 40);
}

/** The model's raw answer → the wire's grid, or a `ScanProblem`. */
export function normalizeScan(raw: unknown): CodenamesScanResponse {
  const parsed = RawScanSchema.safeParse(raw);
  if (!parsed.success) throw new ScanProblem("The photo couldn't be read — try another one.");
  const { problem, language, cells } = parsed.data;
  if (problem) throw new ScanProblem(problem);
  if (cells.length !== GRID_CELLS) {
    throw new ScanProblem(
      `Found ${cells.length} cards instead of ${GRID_CELLS} — get the whole grid in the photo.`,
    );
  }
  return CodenamesScanResponseSchema.parse({
    language,
    cells: cells.map((c) => {
      const word = tidyWord(c.word);
      // A blank word is only sure when a cover hides it.
      return { word, sure: c.sure && (word !== "" || c.cover !== null), cover: c.cover };
    }),
  });
}

/** Read a photo of the grid. Throws `ScanProblem`, `AiConfigError` or the provider's error. */
export async function scanGrid(imageDataUri: string): Promise<CodenamesScanResponse> {
  const mediaType = /^data:(image\/[a-z]+);/.exec(imageDataUri)?.[1] ?? "image/jpeg";
  const raw = await structuredGenerate({
    feature: "codenames-scan",
    label: "codenames-scan",
    user: [
      { type: "text", text: SCAN_PROMPT },
      { type: "file", mediaType, filename: "grid", dataUri: imageDataUri },
    ],
    schemaName: "codenames_grid",
    jsonSchema: SCAN_JSON_SCHEMA as unknown as Record<string, unknown>,
    budgetMs: SCAN_BUDGET_MS,
    reasoningEffort: "low",
  });
  return normalizeScan(raw);
}
