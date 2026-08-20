// One-time "skill profiles are live" celebration takeover. Unveils the
// viewer's own hexagon, their best TRUE fact as a medal centerpiece (game art
// when the fact is game-specific), and the relevant top-3 board with their row
// glowing. Every number is server-derived; the modal only celebrates it.
//
// Presentational only — `GreetingHost` decides when it is due and owns the
// acknowledgement, and `GreetingShell` owns the frame it shares with a
// spotlight.

import type {
  PlayerSkillResponse,
  SkillHighlightWire,
  SkillLeaderboardsResponse,
} from "@boardgames/core/protocol";
import type { ReactNode } from "react";
import { DEFAULT_ACCENT } from "../../../lib/accent.ts";
import { resolveGame } from "../../../lib/games-by-slug.ts";
import { MicroLabel } from "../../ui/Label.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { HexSkillChart } from "../HexSkillChart.tsx";
import { toBoardRows } from "./board-rows.ts";
import { GreetingShell } from "./GreetingShell.tsx";
import { LeaderboardList, type LeaderboardRow } from "./LeaderboardList.tsx";
import { Medal } from "./Medal.tsx";
import { highlightCopy, TRAIT_COPY } from "./trait-copy.ts";

export function SkillIntroModalView({
  firstName = null,
  accentHex,
  highlight,
  skill,
  boards,
  onDismiss,
  onCta,
  switcher,
}: {
  firstName?: string | null;
  accentHex: string | null | undefined;
  highlight: SkillHighlightWire;
  skill: PlayerSkillResponse;
  boards: SkillLeaderboardsResponse | undefined;
  onDismiss: () => void;
  onCta: () => void;
  /** Admin-only dev tool: preview the modal as another member. */
  switcher?: ReactNode;
}) {
  const accent = accentHex ?? DEFAULT_ACCENT;
  const copy = highlightCopy(highlight);
  const game = highlight.kind === "game-first" ? resolveGame(highlight.slug) : undefined;

  // The board backing the claim (top 3 + the viewer's row via LeaderboardList).
  let boardRows: LeaderboardRow[] = [];
  let boardLabel = "";
  if (boards) {
    if (highlight.kind === "game-first") {
      const board = boards.games.find((b) => b.slug === highlight.slug);
      boardLabel = game?.title ?? highlight.slug;
      boardRows = toBoardRows(board?.entries ?? [], boards.players, (e) => `${e.matches}×`);
    } else if (highlight.kind === "trait-first" || highlight.kind === "trait-top3") {
      const board = boards.traits.find((b) => b.trait === highlight.trait);
      boardLabel = `${TRAIT_COPY[highlight.trait].label} leaderboard`;
      boardRows = toBoardRows(board?.entries ?? [], boards.players, (e) => String(e.score));
    }
  }

  const axes = skill.traits?.map((t) => ({
    label: TRAIT_COPY[t.trait].label,
    value: t.score / 100,
    provisional: t.provisional,
  }));
  const bestTrait =
    highlight.kind === "trait-strong" || highlight.kind === "top-trait" ? highlight : null;

  return (
    <GreetingShell
      accentHex={accent}
      eyebrow="New feature unlocked"
      title="Skill profiles are live"
      subheader={
        <p className="text-sm text-fg-muted">
          Every match ever recorded now powers six trait ratings, per-game rankings and the group's
          hall of fame.
        </p>
      }
      heroEyebrow={firstName ? `${firstName}'s headline` : "Your headline"}
      heroTitle={copy.title}
      heroDetail={copy.detail}
      emblem={<Medal highlight={highlight} />}
      coverSrc={game?.thumbnail}
      ctaLabel="See your stats"
      onCta={onCta}
      onDismiss={onDismiss}
      switcher={switcher}
    >
      {/* The proof: their own hexagon + the board backing the claim. */}
      <div className="grid shrink-0 gap-4 sm:grid-cols-5">
        <Surface
          variant="tile"
          padding="none"
          className="flex flex-col items-center p-3 sm:col-span-2"
        >
          <MicroLabel className="mb-1 font-semibold">Your skill profile</MicroLabel>
          {axes && (
            <div className="w-44 sm:w-40">
              <HexSkillChart skill={{ axes }} accentHex={accent} />
            </div>
          )}
        </Surface>
        <Surface variant="tile" padding="none" className="min-w-0 p-3 sm:col-span-3">
          {boardRows.length > 0 ? (
            <>
              <MicroLabel className="mb-1.5 flex items-center gap-1.5 font-semibold">
                {game && (
                  <img src={game.thumbnail} alt="" className="h-4 w-4 rounded object-cover" />
                )}
                {boardLabel}
              </MicroLabel>
              <LeaderboardList rows={boardRows} highlightUserId={skill.userId} topN={3} />
            </>
          ) : (
            bestTrait && (
              <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
                <MicroLabel className="font-semibold">
                  {TRAIT_COPY[bestTrait.trait].label}
                </MicroLabel>
                <p className="text-3xl font-black tabular-nums text-[var(--accent)]">
                  {bestTrait.score}
                </p>
                <p className="text-3xs text-fg-muted">score of 100</p>
              </div>
            )
          )}
        </Surface>
      </div>
    </GreetingShell>
  );
}
