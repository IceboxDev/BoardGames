// Read-only one-off: list users whose name looks like "Paul".
// Run with: node --env-file=.env scripts/find-user.mjs paul

import { createClient } from "@libsql/client";

const needle = (process.argv[2] ?? "paul").toLowerCase();
const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url) {
  console.error("TURSO_DATABASE_URL missing — run with `node --env-file=.env scripts/find-user.mjs <name>`");
  process.exit(1);
}

const db = createClient({ url, authToken });
const { rows } = await db.execute({
  sql: `SELECT id, name, email, role, createdAt FROM user
        WHERE LOWER(name) LIKE ? OR LOWER(email) LIKE ?
        ORDER BY name`,
  args: [`%${needle}%`, `%${needle}%`],
});

if (rows.length === 0) {
  console.log(`No users matching "${needle}".`);
} else {
  console.log(`${rows.length} match(es) for "${needle}":`);
  for (const r of rows) {
    console.log(`  id=${r.id}  name=${r.name}  email=${r.email}  role=${r.role}`);
  }
}
