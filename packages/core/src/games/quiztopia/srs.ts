// The trainer's scheduler lives with every trainer's shared code now; the
// Quiztopia path stays for its many importers.
export * from "../../trainers/srs.ts";

/** Quiztopia self-grades with two grades ("didn't know" / "knew it"). */
export type SrsGrade = "again" | "good";
