import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type AvailableGames,
  type ReactionAggregate,
  type ReactionKind,
  setGameReaction,
} from "../../lib/calendar-games";
import { qk } from "../../lib/query-keys";

type Size = "md" | "sm";

type Props = {
  date: string;
  slug: string;
  accentHex: string;
  aggregate: ReactionAggregate;
  size?: Size;
  disabled?: boolean;
};

const KINDS: { kind: ReactionKind; emoji: string; label: string }[] = [
  { kind: "hype", emoji: "❤", label: "Hype" },
  { kind: "teach", emoji: "🤝", label: "Teach" },
  { kind: "learn", emoji: "📚", label: "Learn" },
];

export default function GameReactions({
  date,
  slug,
  accentHex,
  aggregate,
  size = "md",
  disabled = false,
}: Props) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ kind, on }: { kind: ReactionKind; on: boolean }) =>
      setGameReaction(date, slug, kind, on),
    onMutate: async ({ kind, on }) => {
      await queryClient.cancelQueries({ queryKey: qk.availableGames(date) });
      const prev = queryClient.getQueryData<AvailableGames>(qk.availableGames(date));
      queryClient.setQueryData<AvailableGames>(qk.availableGames(date), (cur) => {
        if (!cur) return cur;
        const nextReactions = { ...cur.reactions };
        const existing = nextReactions[slug] ?? { hype: 0, teach: 0, learn: 0, viewer: [] };
        const agg: ReactionAggregate = {
          hype: existing.hype,
          teach: existing.teach,
          learn: existing.learn,
          viewer: [...existing.viewer],
        };
        const viewer = new Set(agg.viewer);
        if (on && !viewer.has(kind)) {
          viewer.add(kind);
          agg[kind] += 1;
        } else if (!on && viewer.has(kind)) {
          viewer.delete(kind);
          agg[kind] = Math.max(0, agg[kind] - 1);
        }
        agg.viewer = [...viewer];
        nextReactions[slug] = agg;
        return { ...cur, reactions: nextReactions };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) {
        queryClient.setQueryData(qk.availableGames(date), ctx.prev);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.availableGames(date) });
    },
  });

  const viewerSet = new Set(aggregate.viewer);
  const isPending = mutation.isPending;

  function handleClick(e: React.MouseEvent<HTMLButtonElement>, kind: ReactionKind) {
    e.stopPropagation();
    e.preventDefault();
    if (disabled || isPending) return;
    const on = !viewerSet.has(kind);
    mutation.mutate({ kind, on });
  }

  const padding = size === "sm" ? "px-2 py-1" : "px-3 py-1.5";
  const textSize = size === "sm" ? "text-[11px]" : "text-xs";
  const gap = size === "sm" ? "gap-1.5" : "gap-2";

  return (
    <div className={`flex items-center justify-center ${gap}`}>
      {KINDS.map(({ kind, emoji, label }) => {
        const active = viewerSet.has(kind);
        const count = aggregate[kind];
        const style = active
          ? {
              borderColor: accentHex,
              backgroundColor: `color-mix(in srgb, ${accentHex} 22%, transparent)`,
              color: "#fff",
            }
          : undefined;
        return (
          <button
            key={kind}
            type="button"
            onClick={(e) => handleClick(e, kind)}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            disabled={disabled || isPending}
            aria-label={`${label}${active ? " (active)" : ""}`}
            aria-pressed={active}
            title={label}
            style={style}
            className={`inline-flex items-center gap-1.5 rounded-full border ${padding} ${textSize} font-semibold tabular-nums transition ${
              active
                ? "shadow-sm"
                : "border-white/10 bg-white/[0.04] text-gray-300 hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <span aria-hidden="true">{emoji}</span>
            <span>{label}</span>
            <span className={`tabular-nums ${active ? "text-white" : "text-gray-400"}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
