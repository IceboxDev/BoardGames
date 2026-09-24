import { isLeech } from "@boardgames/core/games/quiztopia/srs";
import { useQuery } from "@tanstack/react-query";
import { cn } from "../../../../lib/cn";
import { qk } from "../../../../lib/query-keys";
import { statesQuery } from "../../api";

// Five dots for a set's five questions: emerald = in review (known), amber =
// still learning, rose = lapsed, hollow = never seen. One `states` request
// per article page — the category list deliberately skips these so 177
// rows never fan out into 177 requests.

type Props = {
  questionIds: readonly string[];
  className?: string;
};

type DotKind = "known" | "learning" | "lapsed" | "unseen";

const DOT: Record<DotKind, string> = {
  known: "bg-emerald-400",
  learning: "bg-amber-400",
  lapsed: "bg-rose-400",
  unseen: "border border-line-strong bg-transparent",
};

const WORD: Record<DotKind, string> = {
  known: "known",
  learning: "learning",
  lapsed: "lapsed",
  unseen: "not seen",
};

export function QuestionDots({ questionIds, className }: Props) {
  const ids = [...questionIds];
  const query = useQuery({
    queryKey: qk.quiztopiaStates(ids),
    queryFn: statesQuery(ids),
    enabled: ids.length > 0,
    staleTime: 60_000,
  });
  const byId = new Map((query.data?.states ?? []).map((s) => [s.questionId, s]));
  const kinds: DotKind[] = ids.map((id) => {
    const s = byId.get(id);
    if (!s) return "unseen";
    if (s.state === "review") return "known";
    if (s.state === "relearning" || isLeech(s)) return "lapsed";
    return "learning";
  });
  const known = kinds.filter((k) => k === "known").length;
  const label = query.data
    ? `${known} of ${ids.length} known`
    : `${ids.length} questions, progress loading`;
  return (
    <span
      role="img"
      aria-label={label}
      title={kinds.map((k, i) => `Q${i + 1} ${WORD[k]}`).join(" · ")}
      className={cn("inline-flex items-center gap-1", className)}
    >
      {kinds.map((k, i) => (
        <span key={ids[i]} className={cn("block h-2 w-2 rounded-full", DOT[k])} />
      ))}
    </span>
  );
}
