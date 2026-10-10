import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type AvailableGames,
  type ReactionAggregate,
  type ReactionKind,
  setGameReaction,
} from "../../lib/calendar-games";
import { qk } from "../../lib/query-keys";
import { ReactionButtons } from "./ReactionButtons";

type Props = {
  date: string;
  slug: string;
  accentHex: string;
  aggregate: ReactionAggregate;
  size?: "md" | "sm";
  disabled?: boolean;
  /** Hide the numeric count badge. The viewer's own active state still
   * shows via icon color. Used in the carousel to prevent meta-voting —
   * users shouldn't see how many others voted while they're still picking. */
  hideCount?: boolean;
  /**
   * `vote` (default): hype / teach / learn. `pick`: a host curating a private
   * night's lineup — one toggle, "In the lineup", backed by the hype row so
   * the server's ranking needs no second concept.
   */
  mode?: "vote" | "pick";
};

export default function GameReactions({
  date,
  slug,
  accentHex,
  aggregate,
  size = "md",
  disabled = false,
  hideCount = false,
  mode = "vote",
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

  return (
    <ReactionButtons
      aggregate={aggregate}
      accentHex={accentHex}
      size={size}
      // A vote in flight takes no second click on the same game.
      disabled={disabled || mutation.isPending}
      hideCount={hideCount}
      mode={mode}
      onToggle={(kind, on) => mutation.mutate({ kind, on })}
    />
  );
}
