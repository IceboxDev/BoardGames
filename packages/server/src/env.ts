// Loaded as the first import of index.ts. Side-effect only: populates
// `process.env` from `.env.local` (if present) then `.env`. Must run before any
// other module evaluates, because some modules (e.g. `auth.ts`) read env vars
// at top level — if dotenv loads later, those reads see empty values and
// better-auth ends up pointing at the wrong database.
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

// Fail fast in production if a security- or correctness-critical env var is
// missing. Without this, missing values degrade silently: an absent
// BETTER_AUTH_SECRET makes session + WS-ticket signing fall back to a
// hardcoded, publicly-known key (see sessions/ws-ticket.ts), and an absent
// BETTER_AUTH_URL / WEB_ORIGIN leaves auth pointing at localhost in prod.
// Refusing to boot is safer than serving traffic in that state.
if (process.env.NODE_ENV === "production") {
  const required = [
    "TURSO_DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "WEB_ORIGIN",
  ] as const;
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Refusing to boot: missing required production env var(s): ${missing.join(", ")}. ` +
        "Set them in the deployment environment (see packages/server/.env.example).",
    );
  }
}
