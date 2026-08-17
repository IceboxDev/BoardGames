import type {
  PlayerSkillResponse,
  ProfileMatchSummaryItem,
  SkillLeaderboardsResponse,
} from "@boardgames/core/protocol";
import { MotionGlobalConfig } from "framer-motion";
import type { CSSProperties } from "react";
import { SkillIntroModalView } from "../components/profile/skill/SkillIntroModal.tsx";
import {
  HonestNumbers,
  SkillPageContent,
  SkillProgressCard,
} from "../components/profile/skill/SkillPageContent.tsx";
import { PageHeader } from "../components/ui/PageHeader.tsx";
import { PageMain, PageShell } from "../components/ui/PageShell.tsx";
import { Stack } from "../components/ui/Stack.tsx";
import { DEFAULT_ACCENT } from "../lib/accent.ts";

// Dev-only visual preview of the skill/stats page + welcome card with static
// fixtures — no auth/queries, so every state screenshots headlessly at any
// viewport. Mirrors RsvpPreview (incl. the ?frame=WxH iframe trick for true
// phone-width layouts). Route: /dev/skill-preview?view=ranked|locked|intro.

// Headless chromium freezes rAF under --virtual-time-budget, leaving
// framer-motion entrances at opacity 0 — skip animations on this dev-only
// page so every state screenshots deterministically.
MotionGlobalConfig.skipAnimations = true;

const NAMES = [
  "Mantas Kandratavičius",
  "Maximilian Burg",
  "Juliane Franzen",
  "Paul Keppner",
  "Riccardo Giordano",
  "Jaqueline Binder",
];

const PLAYERS = Object.fromEntries(NAMES.map((name, i) => [`u${i + 1}`, { name, image: null }]));

const pct = (rank: number, n: number) => ((n - rank + 0.5) / n) * 100;
// Scores per rank on the group-relative scale (best trait in the group =
// 100, hardcoded floor = 0) — deliberately DIFFERENT per trait at the same
// rank.
const SCORE_BY_RANK = [0, 100, 91, 84, 79, 73, 68, 63, 58, 53, 48, 43];

const RANKED: PlayerSkillResponse = {
  userId: "u1",
  eligibility: { eligible: true, ratedMatches: 49, distinctGames: 17, minMatches: 8, minGames: 3 },
  traits: [
    {
      trait: "int",
      percentile: pct(1, 11),
      score: 100,
      winChance: 64,
      rank: 1,
      of: 11,
      provisional: false,
    },
    {
      trait: "pln",
      percentile: pct(2, 11),
      score: 89,
      winChance: 62,
      rank: 2,
      of: 11,
      provisional: false,
    },
    {
      trait: "per",
      percentile: pct(4, 11),
      score: 74,
      winChance: 56,
      rank: 4,
      of: 11,
      provisional: false,
    },
    {
      trait: "soph",
      percentile: pct(3, 11),
      score: 81,
      winChance: 59,
      rank: 3,
      of: 11,
      provisional: false,
    },
    {
      trait: "soc",
      percentile: pct(6, 11),
      score: 62,
      winChance: 53,
      rank: 6,
      of: 11,
      provisional: false,
    },
    { trait: "dex", percentile: 50, score: 0, winChance: 50, rank: 6, of: 11, provisional: true },
  ],
  games: [{ slug: "7-wonders", rank: 1, of: 5, matches: 12 }],
  highlights: [
    { kind: "trait-first", trait: "int" },
    { kind: "game-first", slug: "7-wonders", matches: 12 },
    { kind: "trait-top3", trait: "pln", rank: 2 },
    { kind: "trait-strong", trait: "soph", percentile: pct(3, 11), score: 81 },
  ],
};

const LOCKED: PlayerSkillResponse = {
  userId: "u6",
  eligibility: { eligible: false, ratedMatches: 5, distinctGames: 2, minMatches: 8, minGames: 3 },
  traits: null,
  games: [],
  highlights: [],
};

const board = (trait: "int" | "pln" | "soc", order: string[]) => ({
  trait,
  entries: order.map((id, i) => ({
    userId: id,
    rank: i + 1,
    percentile: pct(i + 1, 11),
    score: SCORE_BY_RANK[i + 1],
  })),
});

const BOARDS: SkillLeaderboardsResponse = {
  eligibleCount: 11,
  traits: [
    board("int", ["u1", "u5", "u3", "u2", "u4", "u6"]),
    board("pln", ["u2", "u1", "u4", "u3", "u5", "u6"]),
    board("soc", ["u4", "u6", "u2", "u5", "u1", "u3"]),
  ],
  games: [
    {
      slug: "7-wonders",
      entries: [
        { userId: "u1", rank: 1, matches: 12 },
        { userId: "u4", rank: 2, matches: 9 },
        { userId: "u5", rank: 3, matches: 4 },
      ],
    },
    {
      slug: "blood-on-the-clocktower",
      entries: [
        { userId: "u5", rank: 1, matches: 8 },
        { userId: "u6", rank: 2, matches: 7 },
        { userId: "u3", rank: 3, matches: 7 },
        { userId: "u1", rank: 4, matches: 6 },
      ],
    },
  ],
  players: PLAYERS,
};

// Enough summary items for non-trivial honest numbers (11W 6L 1D).
const SUMMARY: ProfileMatchSummaryItem[] = Array.from({ length: 18 }, (_, i) => ({
  matchId: i + 1,
  dateKey: "2026-08-01",
  playedAt: "2026-08-01T17:00:00.000Z",
  gameSlug: "7-wonders",
  gameTitle: "7 Wonders",
  kind: "free-for-all",
  result: i < 11 ? "win" : i < 17 ? "loss" : "draw",
  credit: i < 11 ? 1 : 0.4,
  place: i < 11 ? 1 : 3,
  fieldSize: 4,
  score: null,
  sessions: 1,
  coPlayerIds: [],
}));

export default function SkillPreview() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view") ?? "ranked";

  // ?frame=WxH — re-render this page inside an iframe of that CSS size so a
  // headless browser (whose window has a 500px minimum width) can still lay
  // out a true phone viewport. Media queries evaluate against the iframe.
  const frame = params.get("frame");
  if (frame) {
    const [w, h] = frame.split("x").map(Number);
    const inner = new URLSearchParams(window.location.search);
    inner.delete("frame");
    const qs = inner.toString();
    return (
      <iframe
        title="preview-frame"
        src={window.location.pathname + (qs ? `?${qs}` : "")}
        style={{ width: w || 360, height: h || 800, border: "1px solid #333" }}
      />
    );
  }

  const style = { "--accent": DEFAULT_ACCENT } as CSSProperties;

  return (
    <PageShell>
      <PageMain width="6xl" padding="spacious">
        <Stack gap="lg" style={style}>
          {view === "intro" || view === "intro-game" ? (
            <SkillIntroModalView
              firstName={view === "intro-game" ? "Riccardo" : "Mantas"}
              accentHex={DEFAULT_ACCENT}
              highlight={
                view === "intro-game"
                  ? { kind: "game-first", slug: "blood-on-the-clocktower", matches: 8 }
                  : { kind: "trait-first", trait: "int" }
              }
              skill={view === "intro-game" ? { ...RANKED, userId: "u5" } : RANKED}
              boards={BOARDS}
              switcher={
                <p className="text-center text-3xs text-fg-muted">
                  (admin preview switcher renders here in dev)
                </p>
              }
              onDismiss={() => {}}
              onCta={() => {}}
            />
          ) : view === "locked" ? (
            <>
              <PageHeader
                size="lg"
                eyebrow="Hall of fame"
                title="Linda's stats"
                subtitle="Not ranked yet — the skill profile unlocks with more recorded games"
              />
              <SkillProgressCard eligibility={LOCKED.eligibility} />
              <div className="max-w-xl">
                <HonestNumbers items={SUMMARY.slice(0, 5)} />
              </div>
            </>
          ) : (
            <>
              <PageHeader
                size="lg"
                eyebrow="Hall of fame"
                title="Mantas's stats"
                subtitle="Ranked · 49 rated games across 17 titles"
              />
              <SkillPageContent
                skill={RANKED}
                boards={BOARDS}
                summaryItems={SUMMARY}
                accentHex={DEFAULT_ACCENT}
                previewOpen={params.get("open") === "1"}
              />
            </>
          )}
        </Stack>
      </PageMain>
    </PageShell>
  );
}
