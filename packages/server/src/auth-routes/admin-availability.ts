import { adminApp } from "../auth/index.ts";
import { getDb } from "../db.ts";

export const adminAvailabilityRoutes = adminApp();

adminAvailabilityRoutes.get("/:id/availability", async (c) => {
  const userId = c.req.param("id");
  const { rows } = await getDb().execute({
    sql: "SELECT availability_json FROM user_availability WHERE user_id = ?",
    args: [userId],
  });
  if (rows.length === 0) return c.json({});
  const parsed = JSON.parse(rows[0].availability_json as string) as unknown;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return c.json(parsed);
  }
  return c.json({});
});

export const adminAvailabilityAllRoutes = adminApp();

adminAvailabilityAllRoutes.get("/availability/all", async (c) => {
  const { rows } = await getDb().execute(
    `SELECT ua.user_id, ua.availability_json, u.name, u.email
     FROM user_availability ua
     JOIN user u ON u.id = ua.user_id`,
  );

  const aggregate: Record<string, Array<{ userId: string; name: string; status: string }>> = {};
  for (const row of rows) {
    const userId = row.user_id as string;
    const name = ((row.name as string | null) || (row.email as string | null) || "—").trim() || "—";
    const json = row.availability_json as string;
    let map: unknown;
    try {
      map = JSON.parse(json);
    } catch {
      continue;
    }
    if (!map || typeof map !== "object" || Array.isArray(map)) continue;
    for (const [date, status] of Object.entries(map as Record<string, unknown>)) {
      if (status !== "can" && status !== "maybe") continue;
      let list = aggregate[date];
      if (!list) {
        list = [];
        aggregate[date] = list;
      }
      list.push({ userId, name, status });
    }
  }

  for (const list of Object.values(aggregate)) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  return c.json(aggregate);
});
