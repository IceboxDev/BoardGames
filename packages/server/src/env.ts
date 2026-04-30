// Loaded as the first import of index.ts. Side-effect only: populates
// `process.env` from `.env.local` (if present) then `.env`. Must run before any
// other module evaluates, because some modules (e.g. `auth.ts`) read env vars
// at top level — if dotenv loads later, those reads see empty values and
// better-auth ends up pointing at the wrong database.
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
