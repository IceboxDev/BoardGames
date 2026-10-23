import { emptyLearning, type Learning } from "@boardgames/core/games/chess/trainer/drill";
import { TRAINER_FOLDERS } from "@boardgames/core/games/chess/trainer/folders";
import { useMemo, useState } from "react";
import { SegmentedControl } from "../components/ui";
import { AtlasMap } from "../games/chess/trainer/board/AtlasMap";
import { flatten } from "../games/chess/trainer/board/folder-tree";
import { MapTrail } from "../games/chess/trainer/board/MapTrail";
import { type HomeFolder, TrainerHome } from "../games/chess/trainer/board/TrainerHome";
import type { Blocked } from "../games/chess/trainer/board/useFolderLearning";
import type { Popularity } from "../games/chess/trainer/board/useFolderPopularity";
import { HOME_FIXTURE } from "./chess-home-fixture";

// Dev-only: the trainer's map with fixture numbers shaped like a real White
// repertoire, no auth, for headless captures:
//   /dev/chess-map-preview?w=1200&h=900         — 1.e4's subfolders
//   /dev/chess-map-preview?small=1               — the small folders opened up
//   /dev/chess-map-preview?view=home&day=busy    — the trainer's Home (day: today | busy | none)

const learnt = (over: Partial<Learning>): Learning => ({ ...emptyLearning(), ...over });

/** By the folder's entering move. */
const FIXTURE: Record<string, { l: Learning; games: number; blocked?: Blocked }> = {
  e7e5: {
    l: learnt({ learnt: 12, learning: 30, fresh: 1031, pending: 381, pendingLines: 381 }),
    games: 2_400_000,
  },
  c7c5: {
    l: learnt({ unasked: 1, unreached: 12 }),
    games: 1_300_000,
    blocked: { at: "1…c5", queued: false },
  },
  e7e6: { l: learnt({ fresh: 47, unasked: 1 }), games: 600_000 },
  d7d5: {
    l: learnt({ unasked: 1, unreached: 3 }),
    games: 580_000,
    blocked: { at: "1…d5", queued: false },
  },
  c7c6: { l: learnt({ fresh: 78, pending: 9, pendingLines: 9 }), games: 500_000 },
  d7d6: { l: learnt({ fresh: 9, unasked: 1, unreached: 12 }), games: 200_000 },
  g7g6: { l: learnt({ fresh: 13 }), games: 150_000 },
  b8c6: { l: learnt({ fresh: 29, pending: 1, pendingLines: 1 }), games: 60_000 },
  g8f6: { l: learnt({ fresh: 20, pending: 5, pendingLines: 5 }), games: 70_000 },
  b7b6: { l: learnt({ fresh: 14, pending: 3, pendingLines: 3 }), games: 40_000 },
  a7a6: { l: learnt({ fresh: 5 }), games: 25_000 },
  f7f5: { l: learnt({ learning: 7, practisedToday: 7 }), games: 18_000 },
  a7a5: { l: learnt({ fresh: 4 }), games: 9_000 },
  h7h5: { l: learnt({ fresh: 10 }), games: 7_000 },
  b7b5: { l: learnt({ fresh: 7, pending: 3, pendingLines: 3 }), games: 6_000 },
  h7h6: { l: learnt({ fresh: 5, pending: 1, pendingLines: 1 }), games: 5_000 },
};

export default function ChessMapPreview() {
  const q = new URLSearchParams(window.location.search);
  if (q.get("view") === "home") return <HomePreview day={q.get("day") ?? "today"} />;
  return <MapPreview />;
}

/** The Home with the fixture's real numbers; "busy" makes four folders due and one updated (examples). */
function HomePreview({ day }: { day: string }) {
  const folders = useMemo((): HomeFolder[] => {
    const byId = new Map(HOME_FIXTURE.map((r) => [r[0], r]));
    return flatten(TRAINER_FOLDERS.w).flatMap((placed) => {
      const r = byId.get(placed.folder.id);
      if (!r) return [];
      const [
        ,
        learnt = 0,
        learning = 0,
        fresh = 0,
        ,
        pending = 0,
        pendingLines = 0,
        unasked = 0,
        unreached = 0,
      ] = r;
      const l = {
        ...emptyLearning(),
        learnt,
        learning,
        fresh,
        pending,
        pendingLines,
        unasked,
        unreached,
      };
      const name = placed.folder.name;
      if (day === "busy") {
        if (/Duras|Berlin|Owen|Classical$/.test(name))
          Object.assign(l, { learnt: Math.max(1, fresh - 2), fresh: 0, learning: 2, due: 3 });
        if (/Alekhine/.test(name)) Object.assign(l, { learnt: fresh - 4, fresh: 4 });
      }
      if (day === "none")
        Object.assign(l, { learnt: 0, learning: 0, fresh: 0, pending: l.fresh + l.pending });
      return [{ placed, l, games: null }];
    });
  }, [day]);
  return (
    <div className="flex h-screen flex-col bg-surface-950">
      <TrainerHome
        color="w"
        folders={folders}
        overview={{
          states: [],
          today: { reviews: day === "busy" ? 0 : 7, correct: 7 },
          introducedToday: 7,
          streak: { current: day === "busy" ? 12 : 1, longest: 12, studiedToday: day !== "busy" },
          retention30: day === "busy" ? 0.86 : 1,
        }}
        onDrill={() => {}}
        onShowMap={() => {}}
        onShowBoard={() => {}}
      />
    </div>
  );
}

function MapPreview() {
  const q = new URLSearchParams(window.location.search);
  const w = Number(q.get("w") ?? 1200);
  const h = Number(q.get("h") ?? 900);
  const [small, setSmall] = useState(q.get("small") === "1");
  const [selected, setSelected] = useState<string | null>(null);
  const { level, learning, games, blocked, popularity } = useMemo(() => {
    const all = flatten(TRAINER_FOLDERS.w);
    const e4 = all.find((p) => p.folder.moves.join(" ") === "e2e4");
    const level = all.filter((p) => e4 && p.parents.at(-1) === e4.folder);
    const learning = new Map<string, Learning>();
    const games = new Map<string, number>();
    const blocked = new Map<string, Blocked>();
    const popularity = new Map<string, Popularity>();
    for (const p of level) {
      const f = FIXTURE[p.folder.moves.at(-1) ?? ""];
      if (!f) continue;
      learning.set(p.folder.id, f.l);
      games.set(p.folder.id, 10);
      if (f.blocked) blocked.set(p.folder.id, f.blocked);
      popularity.set(p.folder.id, { games: f.games, share: 0 });
    }
    const sic = level.find((p) => p.folder.moves.at(-1) === "c7c5");
    const alapin = sic?.folder.children[0];
    if (alapin) games.set(alapin.id, 400);
    for (const [i, c] of (alapin?.children ?? []).entries()) games.set(c.id, 60 - i * 4);
    // Inside the Open Game: a few subfolders with moves, so its block lists them.
    const open = level.find((p) => p.folder.moves.at(-1) === "e7e5");
    const sizes = [336, 134, 77, 75, 58, 22, 19, 14, 9];
    const kk = open?.folder.children[0];
    if (kk) learning.set(kk.id, learnt({ fresh: 900 }));
    const ruyLevel = kk?.children ?? [];
    for (const [i, c] of ruyLevel.entries())
      learning.set(c.id, learnt({ fresh: sizes[i % sizes.length] ?? 5, learnt: i === 1 ? 12 : 0 }));
    return { level, learning, games, blocked, popularity };
  }, []);
  return (
    <div className="flex min-h-screen items-start justify-center bg-surface-950 p-4">
      <div className="flex flex-col gap-2" style={{ width: w, height: h }}>
        <div className="flex h-10 shrink-0 items-center justify-between gap-3">
          <SegmentedControl
            aria-label="View"
            options={[
              { value: "home", label: "Home" },
              { value: "map", label: "Map" },
              { value: "board", label: "Board" },
            ]}
            value="map"
            onChange={() => {}}
          />
          <MapTrail
            parent={small ? "King's Pawn" : "All openings"}
            current={small ? "Rare Replies" : "King's Pawn"}
            onUp={() => setSmall(false)}
          />
        </div>
        <AtlasMap
          folders={level}
          learning={learning}
          games={games}
          blocked={blocked}
          popularity={popularity}
          selected={selected}
          onSelect={setSelected}
          onOpen={() => {}}
          showSmall={small}
          onShowSmall={() => setSmall(true)}
        />
      </div>
    </div>
  );
}
