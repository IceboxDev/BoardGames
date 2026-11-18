import { z } from "zod";

// The Codenames Companion's grid scan: a player at a big table photographs the
// 25 word cards and gets them on their phone (`web/src/games/codenames/companion/`).
// The server reads the photo with a vision model (`server/src/lib/codenames-scan.ts`)
// and answers with the grid; everything after that stays on the phone.

/** The longest base64 data URI accepted — the client downscales to ~2048 px first. */
export const SCAN_IMAGE_MAX = 4_000_000;

export const CodenamesScanRequestSchema = z.object({
  image: z
    .string()
    .regex(/^data:image\/(png|jpe?g|webp);base64,/, "Expected an image data URI")
    .max(SCAN_IMAGE_MAX, "The photo is too large"),
});
export type CodenamesScanRequest = z.infer<typeof CodenamesScanRequestSchema>;

/** What lies on a card at the table, as far as the companion tracks it (no assassin: it ends the game). */
export const ScanCoverSchema = z.enum(["red", "blue", "bystander"]);
export type ScanCover = z.infer<typeof ScanCoverSchema>;

export const ScanCellSchema = z.object({
  /** The word as printed ("" when a cover hides it). */
  word: z.string().max(40),
  /** The model was confident of the word. */
  sure: z.boolean(),
  cover: ScanCoverSchema.nullable(),
});
export type ScanCell = z.infer<typeof ScanCellSchema>;

export const GRID_CELLS = 25;

export const CodenamesScanResponseSchema = z.object({
  /** The cards' language, when the model could tell. */
  language: z.enum(["en", "de"]).nullable(),
  /** Row by row from the top-left, as seen from the camera. */
  cells: z.array(ScanCellSchema).length(GRID_CELLS),
});
export type CodenamesScanResponse = z.infer<typeof CodenamesScanResponseSchema>;
