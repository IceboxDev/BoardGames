import type { PurchaseVoteAnnounceGreeting } from "@boardgames/core/protocol";
import { MotionConfig, MotionGlobalConfig } from "framer-motion";
import { useState } from "react";
import { ArrivalTakeoverView } from "../components/arrivals/ArrivalTakeoverView";
import type { ArrivalCard } from "../components/arrivals/arrival-view-model";
import { PreviewFrame } from "../components/dev/PreviewFrame";
import { PurchaseTakeover } from "../components/purchase-vote/PurchaseTakeover";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { cn } from "../lib/cn";
import { resolveGame } from "../lib/games-by-slug";

// Dev-only preview of the arrivals takeover with static data and no
// auth/queries, so its phone and desktop layouts can be captured headlessly.
// Route: /dev/arrival-preview
//   ?scene=october|one|two|three|no-avatars|long-titles|many-voters
//   ?step=arrival|vote|ballot   the October takeover's page
//   ?photos=<dir>  real photos from public/<dir>/<slug>.jpg (never committed)
//   ?bare          no scene switcher
//   ?frame=WxH   render inside an iframe of that CSS size (true phone width)
//   ?motion=1    watch the real entrance + orbit instead of the frozen frame
//   ?voice=you   the viewer is one of the purchasers
//
// Photos are catalog thumbnails (object-cover crops the 16:9 art to 4:5 —
// good enough for layout); placeholders and avatars are SVG data URIs built
// here, so the page adds no binary fixture (every image extension is LFS-
// tracked in this repo).

const params = new URLSearchParams(window.location.search);
const LIVE_MOTION = params.has("motion");
/** `?bare`: hide the scene switcher (clean screenshots). */
const BARE = params.has("bare");
// Headless captures race framer's entrances (a shot at opacity 0 looks
// broken); skip them unless motion is explicitly requested.
MotionGlobalConfig.skipAnimations = !LIVE_MOTION;

const SCENES = [
  "october",
  "one",
  "two",
  "three",
  "no-avatars",
  "long-titles",
  "many-voters",
] as const;
type Scene = (typeof SCENES)[number];

const NAMES = [
  "Mantas Kandratavičius",
  "Paul Otto",
  "Juliane Meyer",
  "Riccardo Conti",
  "Aydan Yılmaz",
  "Jaqueline Silva",
  "Tom Becker",
  "Nina Sørensen",
  "Ola Nowak",
  "Kai Tanaka",
  "Lea Fischer",
  "Omar Haddad",
  "Sofia Rossi",
  "Ben Carter",
];
const ACCENTS = ["#6366f1", "#22d3ee", "#d36830", "#a855f7", "#10b981", "#f59e0b"];

function svgUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** A soft two-stop gradient disc standing in for a real avatar. */
function faceUri(i: number): string {
  const a = ACCENTS[i % ACCENTS.length];
  const b = ACCENTS[(i + 2) % ACCENTS.length];
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="g" cx="35%" cy="30%"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></radialGradient></defs><rect width="64" height="64" fill="url(#g)"/></svg>`,
  );
}

function placeholderUri(hex: string): string {
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 5"><rect width="4" height="5" fill="${hex}"/></svg>`,
  );
}

function fixture(
  slug: string,
  purchaserIndex: number,
  votes: number,
  faces: number,
  opts: { avatars?: boolean; title?: string } = {},
): ArrivalCard {
  const def = resolveGame(slug);
  const avatars = opts.avatars ?? true;
  const accent = def?.accentHex ?? "#6366f1";
  return {
    slug,
    title: opts.title ?? def?.title ?? slug,
    accentHex: accent,
    purchaser: {
      id: `u${purchaserIndex + 1}`,
      name: NAMES[purchaserIndex] ?? "Someone",
      image: avatars ? faceUri(purchaserIndex) : null,
      accentHex: ACCENTS[purchaserIndex % ACCENTS.length] ?? null,
    },
    votes,
    voters: Array.from({ length: faces }, (_, i) => ({
      image: avatars && i % 3 !== 1 ? faceUri(i + 3) : null,
      accentHex: ACCENTS[(i + 1) % ACCENTS.length] ?? null,
    })),
    photoSrc: def?.thumbnail ?? placeholderUri(accent),
    placeholder: placeholderUri(accent),
    width: 1280,
    height: 1600,
  };
}

/** `?photos=<dir>`: real arrival photos served from public/<dir>/<slug>.jpg
 * (dev only, never committed) in place of the catalog art. */
const PHOTO_DIR = params.get("photos");
const withPhoto = (card: ArrivalCard): ArrivalCard =>
  PHOTO_DIR ? { ...card, photoSrc: `/${PHOTO_DIR}/${card.slug}.jpg` } : card;

const CARDS: Record<Scene, ArrivalCard[]> = {
  // September's vote as it closed: the three games bought from it.
  october: [
    withPhoto(fixture("bomb-busters", 0, 5, 5)),
    withPhoto(fixture("wingspan", 0, 4, 4)),
    withPhoto(fixture("dune-imperium-uprising", 0, 3, 3)),
  ],
  one: [fixture("arcs", 0, 6, 6)],
  two: [fixture("arcs", 0, 6, 6), fixture("spirit-island", 1, 4, 4)],
  three: [
    fixture("arcs", 0, 6, 6),
    fixture("spirit-island", 1, 4, 4),
    fixture("dune-imperium-uprising", 0, 3, 3),
  ],
  "no-avatars": [
    fixture("arcs", 0, 5, 5, { avatars: false }),
    fixture("spirit-island", 2, 2, 2, { avatars: false }),
  ],
  "long-titles": [
    fixture("hegemony-lead-your-class-to-victory", 3, 7, 7),
    fixture("dune-imperium-uprising", 4, 5, 5, { title: "Dune: Imperium – Uprising" }),
    fixture("concordia-special-edition", 5, 1, 1),
  ],
  "many-voters": [fixture("arcs", 0, 14, 14)],
};

const TOTALS: Record<Scene, { voterCount: number; votesCast: number }> = {
  october: { voterCount: 10, votesCast: 30 },
  one: { voterCount: 6, votesCast: 15 },
  two: { voterCount: 7, votesCast: 18 },
  three: { voterCount: 8, votesCast: 22 },
  "no-avatars": { voterCount: 5, votesCast: 9 },
  "long-titles": { voterCount: 9, votesCast: 24 },
  "many-voters": { voterCount: 14, votesCast: 31 },
};

export default function ArrivalPreview() {
  const [scene, setScene] = useState<Scene>(() => {
    const s = params.get("scene");
    return SCENES.includes(s as Scene) ? (s as Scene) : "october";
  });
  if (params.get("frame")) return <PreviewFrame params={params} />;

  const viewerId = params.get("voice") === "you" ? "u1" : "u99";
  const noop = () => {};
  const step = params.get("step");

  return (
    <MotionConfig reducedMotion={LIVE_MOTION ? "user" : "always"}>
      <div className={cn("fixed left-1/2 top-2 z-takeover -translate-x-1/2", BARE && "hidden")}>
        <SegmentedControl
          shape="pill"
          size="sm"
          aria-label="Preview scene"
          value={scene}
          onChange={setScene}
          options={SCENES.map((s) => ({ value: s, label: s }))}
        />
      </div>
      {scene === "october" ? (
        <OctoberTakeover
          key={step}
          cards={CARDS.october}
          viewerId={viewerId}
          step={step === "vote" || step === "ballot" ? step : "arrival"}
        />
      ) : (
        <ArrivalTakeoverView
          key={scene}
          cards={CARDS[scene]}
          totals={TOTALS[scene]}
          viewerId={viewerId}
          onDismiss={noop}
          onCta={noop}
        />
      )}
    </MotionConfig>
  );
}

/** The October vote as it opens: the two-page purchase takeover over
 * September's arrivals, with a local ballot (no server). */
const OCTOBER_VOTE = {
  kind: "purchase-vote-announce",
  pollId: 2,
  title: "The October vote: games for the whole table",
  blurb:
    "September's vote was about the all-time classics — and three of its games are now on the shelf. October is about the size of our table: a game night averages six players and often reaches eight or ten, but most of our games stop at four or five. Every contender here seats eight or more, so the whole group can play together instead of splitting up.",
  candidates: [
    "sidereal-confluence",
    "challengers-beach-cup",
    "ready-set-bet",
    "feed-the-kraken",
    "monikers",
    "telestrations",
    "cartographers",
    "two-rooms-and-a-boom",
    "perudo",
    "one-king-one-crown",
  ],
  voterCount: 0,
  requiredVoters: 10,
} satisfies PurchaseVoteAnnounceGreeting;

function OctoberTakeover({
  cards,
  viewerId,
  step,
}: {
  cards: ArrivalCard[];
  viewerId: string;
  step: "arrival" | "vote" | "ballot";
}) {
  const [selected, setSelected] = useState<string[]>(["telestrations"]);
  const candidates = OCTOBER_VOTE.candidates
    .map((slug) => resolveGame(slug))
    .filter((g) => g !== undefined)
    .sort((a, b) => a.title.localeCompare(b.title));
  const noop = () => {};
  return (
    <PurchaseTakeover
      arrival={{ cards, totals: TOTALS.october }}
      vote={OCTOBER_VOTE}
      viewerId={viewerId}
      onClose={noop}
      onArrivalCta={noop}
      initialStep={step}
      ballot={{
        candidates,
        selected,
        savedVotes: [],
        voterCount: 0,
        requiredVoters: OCTOBER_VOTE.requiredVoters,
        view: "picking",
        pollClosed: false,
        saving: false,
        error: null,
        onToggle: (slug) =>
          setSelected((cur) =>
            cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug],
          ),
        onSubmit: noop,
        onClose: noop,
      }}
    />
  );
}
