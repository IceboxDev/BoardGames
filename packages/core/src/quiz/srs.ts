// The trainer's scheduler lives with every trainer's shared code now; the
// quiz trainer re-exports it with its own two-grade vocabulary.
export * from "../trainers/srs.ts";

/** The quiz trainer self-grades with two grades ("didn't know" / "knew it"). */
export type SrsGrade = "again" | "good";
