import { ResistanceRecordSchema } from "@boardgames/core/games/the-resistance/record";
import {
  type Assumptions,
  AssumptionsSchema,
  defaultAssumptions,
} from "@boardgames/core/games/the-resistance/solver/assumptions";
import { z } from "zod";

// The Solver's per-browser state: the assumptions a viewer tuned, and the
// tabletop games they entered by hand. Both are conveniences — every read is
// schema-checked and every access guarded, so a private window or a cleared
// store just starts fresh.

const ASSUMPTIONS_KEY = "resistance-solver-assumptions";
const TABLES_KEY = "resistance-solver-tables";

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked — the Solver works without it.
  }
}

export function loadAssumptions(): Assumptions {
  const parsed = AssumptionsSchema.safeParse(read(ASSUMPTIONS_KEY));
  return parsed.success ? parsed.data : defaultAssumptions();
}

export function saveAssumptions(assumptions: Assumptions): void {
  write(ASSUMPTIONS_KEY, assumptions);
}

export const SavedTableSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().max(80),
  updatedAt: z.number(),
  /** The seat the person entering the game played, and what they were. */
  me: z
    .object({ seat: z.number().int().min(0).max(9), role: z.enum(["resistance", "spy"]) })
    .nullable(),
  /** Spies the entering player knew at the start (a spy's reveal). */
  knownSpies: z.array(z.number().int().min(0).max(9)),
  record: ResistanceRecordSchema,
});
export type SavedTable = z.infer<typeof SavedTableSchema>;

export function loadTables(): SavedTable[] {
  const parsed = z.array(SavedTableSchema).safeParse(read(TABLES_KEY));
  return parsed.success ? parsed.data.sort((a, b) => b.updatedAt - a.updatedAt) : [];
}

export function loadTable(id: string): SavedTable | null {
  return loadTables().find((t) => t.id === id) ?? null;
}

export function saveTable(table: SavedTable): void {
  write(TABLES_KEY, [table, ...loadTables().filter((t) => t.id !== table.id)].slice(0, 50));
}

export function deleteTable(id: string): void {
  write(
    TABLES_KEY,
    loadTables().filter((t) => t.id !== id),
  );
}

export function newTableId(): string {
  return `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}
