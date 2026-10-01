import type { Grade } from "@boardgames/core/games/the-resistance/solver/grade";
import type { Tone } from "../../../../components/ui";

export const GRADE_STYLE: Record<Grade, { label: string; tone: Tone }> = {
  best: { label: "Best", tone: "emerald" },
  good: { label: "Good", tone: "sky" },
  note: { label: "Note", tone: "neutral" },
  inaccuracy: { label: "Inaccuracy", tone: "amber" },
  mistake: { label: "Mistake", tone: "orange" },
  blunder: { label: "Blunder", tone: "rose" },
};
