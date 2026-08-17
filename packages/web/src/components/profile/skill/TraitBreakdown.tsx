import type {
  PlayerTraitStanding,
  SkillLeaderboardsResponse,
  SkillTraitId,
} from "@boardgames/core/protocol";
import { useState } from "react";
import { cn } from "../../../lib/cn.ts";
import { reportPageView } from "../../../lib/page-views.ts";
import { ChevronDownIcon } from "../../icons";
import { LeaderboardList, type LeaderboardRow } from "./LeaderboardList.tsx";
import { TraitIcon } from "./TraitIcon.tsx";
import { TRAIT_COPY } from "./trait-copy.ts";

// The six skills, each explained in place: icon, name, what the trait means,
// a 1–100 score with a bar — and the trait's leaderboard on demand (tap to
// expand; one open at a time, never dumped on page load).

function traitBoardRows(boards: SkillLeaderboardsResponse, trait: SkillTraitId): LeaderboardRow[] {
  const board = boards.traits.find((b) => b.trait === trait);
  return (board?.entries ?? []).map((e) => ({
    userId: e.userId,
    name: boards.players[e.userId]?.name ?? "Unknown player",
    image: boards.players[e.userId]?.image ?? null,
    rank: e.rank,
    value: String(e.score),
  }));
}

export function TraitBreakdown({
  traits,
  boards,
  highlightUserId,
  defaultOpen = null,
}: {
  traits: readonly PlayerTraitStanding[];
  boards: SkillLeaderboardsResponse | undefined;
  highlightUserId: string;
  /** Initially expanded trait — used by the dev preview for screenshots. */
  defaultOpen?: SkillTraitId | null;
}) {
  const [open, setOpen] = useState<SkillTraitId | null>(defaultOpen);

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {traits.map((t) => {
        const copy = TRAIT_COPY[t.trait];
        const score = t.score;
        const rows = boards ? traitBoardRows(boards, t.trait) : [];
        const expandable = rows.length > 0;
        const isOpen = open === t.trait;
        return (
          <div
            key={t.trait}
            className={cn(
              "rounded-xl transition",
              isOpen && "bg-white/[0.04] ring-1 ring-white/10",
            )}
          >
            {/* biome-ignore lint/correctness/noRestrictedElements: full-row accordion toggle — Button chrome doesn't fit */}
            <button
              type="button"
              disabled={!expandable}
              aria-expanded={isOpen}
              onClick={() => {
                if (!isOpen) reportPageView("skill-board", t.trait);
                setOpen(isOpen ? null : t.trait);
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left",
                expandable && "transition hover:bg-white/5",
                t.provisional && "opacity-55",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-800",
                  t.provisional ? "text-fg-muted" : "text-[var(--accent)]",
                )}
              >
                <TraitIcon trait={t.trait} className="h-4.5 w-4.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-fg-primary">{copy.label}</span>
                  <span className="shrink-0 tabular-nums text-sm font-black text-white">
                    {t.provisional ? "—" : score}
                  </span>
                </span>
                <span className="mt-0.5 block text-2xs leading-snug text-fg-muted">
                  {copy.blurb}
                </span>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded bg-surface-800">
                  {/* Provisional = not computed yet → an EMPTY bar, not mid-pack. */}
                  <span
                    className="block h-full rounded bg-[var(--accent)] opacity-90"
                    style={{ width: t.provisional ? 0 : `${Math.max(3, score)}%` }}
                  />
                </span>
              </span>
              <ChevronDownIcon
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-fg-muted transition-transform",
                  isOpen && "rotate-180",
                  !expandable && "invisible",
                )}
              />
            </button>

            {isOpen && (
              <div className="px-2.5 pb-2.5 pl-[3.4rem]">
                <LeaderboardList rows={rows} highlightUserId={highlightUserId} topN={5} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
