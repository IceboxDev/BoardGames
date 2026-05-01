import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";

export const availabilityCountsRoutes = authedApp();

availabilityCountsRoutes.get("/counts", async (c) => {
  const { rows } = await getDb().execute("SELECT availability_json FROM user_availability");

  const counts: Record<string, { can: number; maybe: number }> = {};
  for (const row of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.availability_json as string);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    for (const [date, status] of Object.entries(parsed as Record<string, unknown>)) {
      if (status !== "can" && status !== "maybe") continue;
      let entry = counts[date];
      if (!entry) {
        entry = { can: 0, maybe: 0 };
        counts[date] = entry;
      }
      if (status === "can") entry.can += 1;
      else entry.maybe += 1;
    }
  }

  return c.json(counts);
});
