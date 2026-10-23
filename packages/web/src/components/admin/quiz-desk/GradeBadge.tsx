import type { QuizFactGrade } from "@boardgames/core/protocol/http/quiz-desk";
import { Badge } from "../../ui";
import { GRADE_TONE, gradeTooltip } from "./logic";

/** A fact's research grade; the tooltip says what it means and what the next grade needs. */
export function GradeBadge({
  grade,
  size = "xs",
  className,
}: {
  grade: QuizFactGrade;
  size?: "xs" | "sm";
  className?: string;
}) {
  const tip = gradeTooltip(grade);
  return (
    <span className={className} title={tip}>
      <Badge tone={GRADE_TONE[grade.grade]} size={size} ring>
        <span aria-hidden="true">Grade {grade.grade}</span>
        <span className="sr-only">{tip}</span>
      </Badge>
    </span>
  );
}
