import { TimeControlSchema } from "@boardgames/core/games/chess/schemas";
import { z } from "zod";

// The last solo setup, kept in this browser only so the next game starts from
// it. Storage can be missing or throw (private windows, blocked site data):
// every access is guarded, and a missing or stale value means the defaults.

const SETUP_KEY = "chess:setup:v1";

export const SavedSetupSchema = z.object({
  strategy: z.string(),
  color: z.enum(["w", "random", "b"]),
  timeControl: TimeControlSchema.nullable(),
  takebacks: z.boolean(),
});
export type SavedSetup = z.infer<typeof SavedSetupSchema>;

export function readSetup(): SavedSetup | null {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (!raw) return null;
    const parsed = SavedSetupSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveSetup(setup: SavedSetup): void {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(SavedSetupSchema.parse(setup)));
  } catch {
    // Not remembered: this game still starts.
  }
}
