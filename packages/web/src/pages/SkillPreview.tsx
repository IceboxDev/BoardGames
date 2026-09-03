import type {
  AdminSkillStateResponse,
  PlayerSkillResponse,
  ProfileMatchSummaryItem,
  SkillLeaderboardsResponse,
  SpotlightPayload,
} from "@boardgames/core/protocol";
import { MotionGlobalConfig } from "framer-motion";
import type { CSSProperties } from "react";
import { SkillRatingsCardView } from "../components/admin/SkillRatingsCard.tsx";
import { HexSkillChart } from "../components/profile/HexSkillChart.tsx";
import { SkillIntroModalView } from "../components/profile/skill/SkillIntroModal.tsx";
import {
  HonestNumbers,
  SkillPageContent,
  SkillProgressCard,
} from "../components/profile/skill/SkillPageContent.tsx";
import { SpotlightModalView } from "../components/profile/skill/SpotlightModal.tsx";
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
  ratedSlugs: ["7-wonders", "codenames", "durak", "lost-cities", "parks"],
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
  ratedSlugs: ["codenames", "durak"],
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
  computedAt: "2026-08-19 21:04:11",
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

// One fixture per spotlight event kind, so every arm of the card (podium
// emblem, trait glyph, game cover art, no-board fallback) is screenshottable.
const SPOTLIGHTS: Record<string, SpotlightPayload> = {
  crown: {
    event: { kind: "trait-climb", trait: "pln", from: 4, to: 1, fieldSize: 6 },
    runnersUp: [
      {
        userId: "u4",
        event: { kind: "game-climb", slug: "7-wonders", from: 3, to: 2, fieldSize: 3 },
      },
      { userId: "u6", event: { kind: "profile-unlocked", ratedMatches: 9, distinctGames: 3 } },
    ],
    proof: {
      rows: [
        { userId: "u2", rank: 1, value: "88" },
        { userId: "u1", rank: 2, value: "81" },
        { userId: "u4", rank: 3, value: "74" },
      ],
    },
  },
  climb: {
    event: { kind: "trait-climb", trait: "per", from: 6, to: 4, fieldSize: 6 },
    runnersUp: [{ userId: "u5", event: { kind: "streak-lead", length: 4 } }],
    proof: {
      rows: [
        { userId: "u2", rank: 1, value: "88" },
        { userId: "u1", rank: 2, value: "81" },
        { userId: "u4", rank: 3, value: "74" },
        { userId: "u3", rank: 4, value: "66" },
      ],
    },
  },
  game: {
    event: { kind: "game-climb", slug: "blood-on-the-clocktower", from: 2, to: 1, fieldSize: 4 },
    runnersUp: [],
    proof: {
      rows: [
        { userId: "u5", rank: 1, value: "8×" },
        { userId: "u6", rank: 2, value: "7×" },
        { userId: "u3", rank: 3, value: "7×" },
      ],
    },
  },
  unlock: {
    event: { kind: "profile-unlocked", ratedMatches: 9, distinctGames: 3 },
    runnersUp: [
      { userId: "u1", event: { kind: "trait-climb", trait: "int", from: 2, to: 1, fieldSize: 6 } },
    ],
    proof: null,
  },
  streak: {
    event: { kind: "streak-lead", length: 5 },
    runnersUp: [],
    proof: null,
  },
};

const SPOTLIGHT_SUBJECT: Record<string, string> = {
  crown: "u2",
  climb: "u3",
  game: "u5",
  unlock: "u6",
  streak: "u4",
};

// The admin card, mid-decision: a recompute has produced four candidates and
// an earlier spotlight is still on show.
const ADMIN_STATE: AdminSkillStateResponse = {
  computedAt: "2026-08-19 21:04:11",
  baselineComputedAt: "2026-08-12 20:41:03",
  configVersion: 5,
  stale: true,
  matchesTotal: 92,
  matchesRecordedSince: 5,
  matchesEditedSince: 1,
  eligibleCount: 11,
  candidates: [
    {
      key: "game-climb:blood-on-the-clocktower:u5",
      subjectUserId: "u5",
      event: { kind: "game-climb", slug: "blood-on-the-clocktower", from: 3, to: 1, fieldSize: 9 },
      score: 96,
    },
    {
      key: "profile-unlocked:u6",
      subjectUserId: "u6",
      event: { kind: "profile-unlocked", ratedMatches: 10, distinctGames: 5 },
      score: 90,
    },
    {
      key: "trait-climb:pln:u2",
      subjectUserId: "u2",
      event: { kind: "trait-climb", trait: "pln", from: 4, to: 1, fieldSize: 6 },
      score: 87,
    },
    {
      key: "trait-climb:soph:u3",
      subjectUserId: "u3",
      event: { kind: "trait-climb", trait: "soph", from: 7, to: 6, fieldSize: 9 },
      score: 17,
    },
  ],
  live: {
    id: 4,
    createdAt: "2026-08-13 09:12:44",
    subjectUserId: "u4",
    payload: { event: { kind: "streak-lead", length: 5 }, runnersUp: [], proof: null },
    seenBy: 7,
  },
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

// ?claim=<kind> (ranked view only): strip the highlight ladder and hand the
// claim picker a match summary crafted to land on exactly that ego-safe rung —
// lets every generated claim background be screenshotted. Newest-first, like
// the real payload.
const CLAIM_SUMMARIES: Record<string, ProfileMatchSummaryItem[]> = {
  streak: seq("wwwwlwlw"),
  winrate: seq("wwlwwlwwlw"),
  coop: seq("llllWW"),
  form: seq("wlwlwwllwl"),
  variety: seq("wllwllwll", true),
  dedication: seq("lllll"),
};

function seq(pattern: string, distinctSlugs = false): ProfileMatchSummaryItem[] {
  const slugs = [
    ["7-wonders", "7 Wonders"],
    ["durak", "Durak"],
    ["codenames", "Codenames"],
    ["parks", "Parks"],
    ["sushi-go", "Sushi Go"],
    ["lost-cities", "Lost Cities"],
    ["decrypto", "Decrypto"],
    ["just-one", "Just One"],
    ["azul", "Azul"],
    ["jaipur", "Jaipur"],
  ];
  return [...pattern].map((ch, i) => {
    const [slug, title] = distinctSlugs ? slugs[i % slugs.length] : slugs[0];
    const coop = ch === "W";
    const result = ch === "l" ? "loss" : "win";
    return {
      matchId: i + 1,
      dateKey: "2026-08-01",
      playedAt: "2026-08-01T17:00:00.000Z",
      gameSlug: slug,
      gameTitle: title,
      kind: coop ? "coop" : "free-for-all",
      result,
      credit: result === "win" ? 1 : 0.4,
      place: result === "win" ? 1 : 3,
      fieldSize: 4,
      score: null,
      sessions: 1,
      coPlayerIds: [],
    };
  });
}

export default function SkillPreview() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view") ?? "ranked";
  const claimSummary = CLAIM_SUMMARIES[params.get("claim") ?? ""];

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

  const accent = params.get("accent") ?? DEFAULT_ACCENT;
  const style = { "--accent": accent } as CSSProperties;

  return (
    <PageShell>
      <PageMain width="6xl" padding="spacious">
        <Stack gap="lg" style={style}>
          {view === "admin" ? (
            <SkillRatingsCardView
              state={ADMIN_STATE}
              onRecompute={() => {}}
              onPublish={() => {}}
              onRetract={() => {}}
              notice="Ratings refreshed — 4 moves worth announcing."
            />
          ) : view === "spotlight" ? (
            (() => {
              const kind = params.get("event") ?? "crown";
              const subjectId = SPOTLIGHT_SUBJECT[kind] ?? "u2";
              return (
                <SpotlightModalView
                  payload={SPOTLIGHTS[kind] ?? SPOTLIGHTS.crown}
                  subjectUserId={subjectId}
                  // ?voice=you renders it as the subject sees it.
                  viewerId={params.get("voice") === "you" ? subjectId : "u1"}
                  players={PLAYERS}
                  accentHex={accent}
                  onDismiss={() => {}}
                  onCta={() => {}}
                />
              );
            })()
          ) : view === "intro" || view === "intro-game" ? (
            <SkillIntroModalView
              firstName={view === "intro-game" ? "Riccardo" : "Mantas"}
              accentHex={accent}
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
              {/* Mirrors PlayerSkillPage's centered un-ranked column. */}
              <div className="mx-auto flex w-full max-w-md flex-col gap-6">
                <div className="mx-auto w-full max-w-70">
                  <HexSkillChart skill={null} accentHex={DEFAULT_ACCENT} />
                </div>
                <SkillProgressCard eligibility={LOCKED.eligibility} />
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
                skill={claimSummary ? { ...RANKED, highlights: [], games: [] } : RANKED}
                boards={BOARDS}
                summaryItems={claimSummary ?? SUMMARY}
                accentHex={accent}
                previewOpen={params.get("open") === "1"}
              />
            </>
          )}
        </Stack>
      </PageMain>
    </PageShell>
  );
}
