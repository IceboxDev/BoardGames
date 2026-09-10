// Display name + avatar (+ profile accent) for a set of user ids.
//
// Ratings payloads and greetings store user IDS ONLY and resolve names at read
// time on purpose: renaming a member fixes every leaderboard row and every
// already-published spotlight at once, instead of leaving the old name frozen
// in a JSON blob nobody thinks to migrate.

import { z } from "zod";
import { getDb } from "../db.ts";
import { parseRows } from "./db-rows.ts";

export const NameRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  accent_hex: z.string().nullable(),
});

export type PlayerRef = { name: string; image: string | null; accentHex: string | null };

/** `accent_hex` is validated on write; coerce anything unexpected to null. */
export function safeAccent(value: string | null | undefined): string | null {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}

export async function playerRefs(ids: ReadonlySet<string>): Promise<Record<string, PlayerRef>> {
  if (ids.size === 0) return {};
  const list = [...ids];
  const { rows } = await getDb().execute({
    sql: `SELECT u.id, u.name, u.image, p.accent_hex
            FROM "user" u
            LEFT JOIN user_profiles p ON p.user_id = u.id
           WHERE u.id IN (${list.map(() => "?").join(",")})`,
    args: list,
  });
  const out: Record<string, PlayerRef> = {};
  for (const r of parseRows(NameRowSchema, rows, "user.player-refs")) {
    out[r.id] = { name: r.name, image: r.image, accentHex: safeAccent(r.accent_hex) };
  }
  return out;
}
