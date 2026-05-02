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

type IconProps = { filled: boolean };
type Kind = {
  kind: ReactionKind;
  label: string;
  description: string;
  Icon: (p: IconProps) => React.ReactElement;
};

const KINDS: Kind[] = [
  {
    kind: "hype",
    label: "Hype",
    description: "Want to play this tonight",
    Icon: HeartIcon,
  },
  {
    kind: "teach",
    label: "Teach",
    description: "I'll explain the rules",
    Icon: MortarboardIcon,
  },
  {
    kind: "learn",
    label: "Learn",
    description: "Haven't played, want to learn",
    Icon: BookIcon,
  },
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

  const btnSize = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-[18px] w-[18px]";
  const badgeSize =
    size === "sm" ? "h-3.5 min-w-[14px] text-[8px]" : "h-[18px] min-w-[18px] text-[10px]";
  const gap = size === "sm" ? "gap-1.5" : "gap-2";

  return (
    <div className={`flex items-center ${gap}`}>
      {KINDS.map(({ kind, label, description, Icon }) => {
        const active = viewerSet.has(kind);
        const count = aggregate[kind];
        const activeStyle = active
          ? {
              borderColor: accentHex,
              backgroundColor: accentHex,
              color: "#fff",
              boxShadow: `0 6px 16px -6px ${accentHex}aa`,
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
            aria-label={`${label}: ${description}${count ? ` (${count})` : ""}`}
            aria-pressed={active}
            title={`${label} — ${description}${count ? ` · ${count}` : ""}`}
            style={activeStyle}
            className={`relative inline-flex shrink-0 items-center justify-center rounded-full ${btnSize} backdrop-blur-md transition disabled:cursor-not-allowed disabled:opacity-40 ${
              active
                ? "border"
                : "border border-white/20 bg-black/45 text-white/85 hover:border-white/40 hover:bg-black/65 hover:text-white"
            }`}
          >
            <span className={`${iconSize} flex items-center justify-center`}>
              <Icon filled={active} />
            </span>
            {count > 0 && (
              <span
                className={`pointer-events-none absolute -right-1 -top-1 inline-flex items-center justify-center rounded-full bg-white px-1 font-bold tabular-nums leading-none text-black ${badgeSize}`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function HeartIcon({ filled }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      className="h-full w-full"
    >
      <path d="M12 20.5l-1.7-1.55C5.5 14.6 2 11.5 2 7.6 2 4.5 4.5 2 7.5 2c1.7 0 3.3.8 4.5 2.1C13.2 2.8 14.8 2 16.5 2 19.5 2 22 4.5 22 7.6c0 3.9-3.5 7-8.3 11.35L12 20.5z" />
    </svg>
  );
}

function MortarboardIcon({ filled }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-full w-full"
    >
      <path d="M2 9l10-5 10 5-10 5L2 9z" fill={filled ? "currentColor" : "none"} />
      <path d="M6 11.2v4.3c0 1.2 2.7 2.5 6 2.5s6-1.3 6-2.5v-4.3" />
      <path d="M22 9v5.5" />
    </svg>
  );
}

function BookIcon({ filled }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-full w-full"
    >
      <path
        d="M3 5c2.5-.5 5.5-.5 8.5 0v14.5c-3-.5-6-.5-8.5 0V5z"
        fill={filled ? "currentColor" : "none"}
      />
      <path
        d="M21 5c-2.5-.5-5.5-.5-8.5 0v14.5c3-.5 6-.5 8.5 0V5z"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
}
