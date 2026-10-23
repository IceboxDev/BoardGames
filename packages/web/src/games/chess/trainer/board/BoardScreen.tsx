/**
 * The opening trainer's one screen: your folders on the left, and in the
 * middle one of three views (`?view`):
 *   map    (default) what you know: the open folder's subfolders as blocks,
 *          sized by your moves and shaded by how many you've learnt
 *          (`AtlasMap`), the selected folder beside it (`FolderPanel`);
 *   board  the board and the move explorer. Moves are free — explore
 *          anything; where it's your move in your tree, ★ makes the move you
 *          just played yours and the tree regrows from there;
 *   drill  a spaced-repetition session of your moves (`DrillSession`).
 * Both colours' trees build in the background as soon as the screen opens.
 */
import { emptyLearning, learnable } from "@boardgames/core/games/chess/trainer/drill";
import {
  fixedChoices,
  TRAINER_FOLDERS,
  type TrainerFolder,
} from "@boardgames/core/games/chess/trainer/folders";
import {
  type RepertoireTree,
  type UserChoice,
  withChoice,
} from "@boardgames/core/games/chess/trainer/tree";
import type { LichessLink } from "@boardgames/core/protocol";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import GameScreen from "../../../../components/game-layout/GameScreen";
import { Button, SegmentedControl } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { EvalBar } from "../../analysis/EvalBar";
import type { Score } from "../../analysis/grade";
import ChessBoard, { type BoardArrow } from "../../components/board/ChessBoard";
import { useSquareFit } from "../../logic/board-view";
import { useDrill } from "../drill/useDrill";
import { useDrillSession } from "../drill/useDrillSession";
import { TrainerProviders } from "../engine-provider";
import { legalUcis, routeTo } from "../tree-nav";
import type { ImportState } from "../useLichessImport";
import type { TreeBuild } from "../useTreeBuild";
import { AtlasMap } from "./AtlasMap";
import { BoardTools, ChoiceCard } from "./BoardTools";
import { ConnectionBar } from "./ConnectionBar";
import { DrillBoard, DrillRail } from "./DrillSession";
import { ExplorerRail } from "./ExplorerRail";
import { FolderPanel } from "./FolderPanel";
import { FolderRail } from "./FolderRail";
import { currentFolder, flatten, type Placed, splitName } from "./folder-tree";
import { MapTrail } from "./MapTrail";
import { KIND_OF } from "./markers";
import { lineValue, START, walkLine } from "./model";
import { TrainerHome } from "./TrainerHome";
import { useBoardKeys } from "./useBoardKeys";
import { useFarmQueue } from "./useFarmQueue";
import { useFolderGames } from "./useFolderGames";
import { useFolderLearning } from "./useFolderLearning";
import { useFolderPopularity } from "./useFolderPopularity";
import { usePositionEval } from "./usePositionEval";
import { useTrainerPosition } from "./useTrainerPosition";

type Color = "w" | "b";

interface Props {
  readonly builds: Record<Color, TreeBuild | null>;
  readonly link: LichessLink | null;
  readonly token: string | null;
  readonly importer: ImportState;
  /** Shown above the folders (connection errors). */
  readonly notice?: ReactNode;
}

export function BoardScreen({ builds, link, token, importer, notice }: Props) {
  const pos = useTrainerPosition();
  const build = builds[pos.color];
  const tree = build?.tree ?? null;
  const node = tree?.nodes[pos.here.key] ?? null;
  const [orientation, setOrientation] = useState<Color>(pos.color);
  useEffect(() => setOrientation(pos.color), [pos.color]);

  // The explorer's own lookups (lichess database, quick engine), apart from the build's.
  const [providers, setProviders] = useState<TrainerProviders | null>(null);
  useEffect(() => {
    if (!token) return;
    const p = new TrainerProviders(token);
    setProviders(p);
    return () => {
      p.dispose();
      setProviders(null);
    };
  }, [token]);

  useAutoBuild(builds, !!token);
  useFixedChoices(builds);
  const { choose, busy } = useChoices(builds);

  const prevKey = pos.ply >= 2 ? pos.line[pos.ply - 2]?.key : pos.ply === 1 ? START.key : null;
  const prevNode = prevKey ? tree?.nodes[prevKey] : null;
  const last = pos.last;
  // Moves fixed in code (1.e4, 2.Nf3) aren't changed from the board.
  const fixedAt = (moves: readonly { uci: string }[]) =>
    fixedChoices(pos.color).some((f) => f.moves.join(" ") === moves.map((m) => m.uci).join(" "));
  const fixedHere = fixedAt(pos.line.slice(0, pos.ply));
  const makeMine =
    tree &&
    last &&
    prevKey &&
    prevNode?.side === "user" &&
    prevNode.moves[0]?.uci !== last.uci &&
    !fixedAt(pos.line.slice(0, pos.ply - 1))
      ? {
          san: last.san,
          run: () => choose(pos.color, prevKey, { source: "handpicked", uci: last.uci }),
        }
      : null;
  const engineBest =
    tree && node?.side === "user" && node.choice?.source === "handpicked" && !fixedHere
      ? () => choose(pos.color, pos.here.key, null)
      : null;

  // One evaluation for the bar and the explorer: the tree's, else lichess cloud, else the browser.
  // The positions one move ahead: the line's next move and the tree's replies.
  const ahead = useMemo(() => {
    const next = pos.line[pos.ply]?.fen;
    const replies = (node?.moves ?? []).flatMap((m) => {
      const after = walkLine([...pos.line.slice(0, pos.ply).map((s) => s.uci), m.uci]).at(-1);
      return after ? [after.fen] : [];
    });
    return [...new Set([...(next ? [next] : []), ...replies])].slice(0, 4);
  }, [pos.line, pos.ply, node]);
  const { eval: evaluation, loading: evalLoading } = usePositionEval(
    pos.here.fen,
    node,
    providers,
    ahead,
  );
  // The tree's moves here — your one move, or up to three replies — in the
  // engine's order, coloured by kind (your pick / engine / popular) like the
  // explorer's dots.
  const arrows: BoardArrow[] = useMemo(() => {
    if (!node) return [];
    const scored = (uci: string) => evaluation?.lines.find((l) => l.uci === uci);
    const shown =
      node.side === "user"
        ? node.moves.slice(0, 1)
        : [...node.moves]
            .sort(
              (a, b) => lineValue(scored(b.uci)) - lineValue(scored(a.uci)) || b.games - a.games,
            )
            .slice(0, 3);
    const best = evaluation?.lines[0]?.uci;
    // One colour per kind; the engine's best is the bold, solid one.
    return shown.flatMap((m): BoardArrow[] =>
      m.uci.length >= 4
        ? [
            {
              from: m.uci.slice(0, 2),
              to: m.uci.slice(2, 4),
              tone: KIND_OF[m.source],
              emphasis: shown.length > 1 && m.uci === best,
            },
          ]
        : [],
    );
  }, [node, evaluation]);
  const moves = useMemo(() => legalUcis(pos.here.fen), [pos.here.fen]);
  const score = useMemo((): Score | null => {
    const top = evaluation?.lines[0];
    if (!top) return null;
    // Lines score from the side to move; the bar wants White's view.
    const sign = pos.here.fen.split(" ")[1] === "b" ? -1 : 1;
    return top.mate !== null ? { mate: sign * top.mate } : { cp: sign * (top.cp ?? 0) };
  }, [evaluation, pos.here.fen]);
  const [fitRef, size] = useSquareFit<HTMLDivElement>(40, 0);
  // The rail counts from finished trees only: a rebuild's checkpoints are partial
  // trees, and counting them would reshuffle the folders until it's done.
  const settledW = useSettledTree(builds.w);
  const settledB = useSettledTree(builds.b);
  const trees = useMemo(() => ({ w: settledW, b: settledB }), [settledW, settledB]);

  // ── What you know: the drill schedule summed over the folders ──
  const schedule = useDrill(pos.color);
  const allFolders = useMemo(() => flatten(TRAINER_FOLDERS[pos.color]), [pos.color]);
  // Your games per folder: the rail and the map list the same folders by it.
  const folderGames = useFolderGames(allFolders, build?.folderCounts ?? null);
  const learning = useFolderLearning(
    pos.color,
    trees[pos.color],
    schedule.states,
    schedule.today,
    folderGames.counts,
  );
  const byId = useMemo(() => new Map(learning.all.map((p) => [p.folder.id, p])), [learning.all]);
  const here = useMemo(
    () => currentFolder(learning.all, pos.line.slice(0, pos.ply), learning.owner),
    [learning.all, learning.owner, pos.line, pos.ply],
  );
  // A folder is on the map when it has moves of yours or games of yours (the rail's rule).
  const hasContent = (f: TrainerFolder) => {
    const l = learning.byFolder.get(f.id);
    return (
      (!!l && learnable(l) + l.pending + l.unasked > 0) || (folderGames.counts?.get(f.id) ?? 0) > 0
    );
  };
  // The map shows the rail's level: the folder you're in when it has
  // subfolders, else its parent's (one folder there is one big block).
  const levelOf = (open: Placed | null) =>
    learning.all.filter((p) => (open ? p.parents.at(-1) === open.folder : p.parents.length === 0));
  const mapOpen = here?.folder.children.some(hasContent)
    ? here
    : here
      ? (learning.all.find((p) => p.folder === here.parents.at(-1)) ?? null)
      : null;
  const level = levelOf(mapOpen);
  const mapParent = mapOpen
    ? (learning.all.find((p) => p.folder === mapOpen.parents.at(-1)) ?? null)
    : null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The small folders' block opened up, for one level (a new level closes it).
  const levelId = mapOpen?.folder.id ?? "all";
  const [smallAt, setSmallAt] = useState<string | null>(null);
  const showSmall = smallAt === levelId;
  const selected = level.find((p) => p.folder.id === selectedId) ?? null;
  const panel = selected ?? mapOpen;
  const panelTitle = panel ? splitName(panel.folder.name).label : "All openings";
  const panelLearning = panel
    ? (learning.byFolder.get(panel.folder.id) ?? emptyLearning())
    : learning.total;
  const panelCards = useMemo(() => learning.cardsIn(panel?.folder.id ?? null), [learning, panel]);
  // The deepest folders with something in them: the front page's units.
  const leaves = learning.all.filter(
    (p) => hasContent(p.folder) && !p.folder.children.some(hasContent),
  );
  // Where the Home's folders stand at the farm, for its "back from the farm" line.
  const homeWaiting = useMemo(
    () => leaves.flatMap((p) => learning.waitingIn.get(p.folder.id) ?? []),
    [leaves, learning.waitingIn],
  );
  const farmWaiting = useMemo(
    () => (pos.view === "home" ? [homeWaiting] : []),
    [pos.view, homeWaiting],
  );
  const farmQueue = useFarmQueue(pos.color, farmWaiting);
  const popularity = useFolderPopularity(
    useMemo(() => [...new Set([...level, ...leaves])], [level, leaves]),
    providers,
    trees[pos.color],
  );
  const folderOf = (key: string) => {
    const id = learning.owner.get(key);
    const p = id ? byId.get(id) : undefined;
    return p ? splitName(p.folder.name).label : "Your openings";
  };

  // ── The drill: one session per visit to the view ──
  const ownerOf = useCallback((key: string) => learning.owner.get(key), [learning.owner]);
  const drillPlaced = pos.drillScope ? (byId.get(pos.drillScope) ?? null) : null;
  const drillCards = useMemo(
    () => learning.cardsIn(drillPlaced?.folder.id ?? null),
    [learning, drillPlaced],
  );
  const [sessionNo, setSessionNo] = useState(0);
  // Where "Back" and "End session" return to.
  const [drillFrom, setDrillFrom] = useState<"home" | "map" | "board">("home");
  const session = useDrillSession(
    drillCards,
    schedule,
    pos.view === "drill" ? `${pos.color}:${pos.drillScope ?? "all"}:${sessionNo}` : null,
    ownerOf,
    pos.drillScope !== null,
  );
  // The current card's line through the tree, and its node.
  const drillTree = trees[pos.color];
  const drillKey = session.current?.card.key ?? null;
  const drillRoute = useMemo(
    () => (drillTree && drillKey ? routeTo(drillTree, drillKey) : null),
    [drillTree, drillKey],
  );
  const startDrill = (folderId: string | null) => {
    setSessionNo((n) => n + 1);
    if (pos.view !== "drill") setDrillFrom(pos.view);
    pos.setView("drill", { scope: folderId });
  };
  /** A folder on the map: its parent's level, with it selected. */
  const showOnMap = (p: Placed) => {
    setSelectedId(p.folder.id);
    pos.setView("map", { moves: p.parents.at(-1)?.moves ?? [] });
  };
  const scopeId = pos.view === "board" ? (here?.folder.id ?? null) : (panel?.folder.id ?? null);
  const scopeDue = scopeId ? (learning.byFolder.get(scopeId)?.due ?? 0) : learning.total.due;

  const flip = useCallback(() => setOrientation((o) => (o === "w" ? "b" : "w")), []);
  useBoardKeys(pos.view === "board", pos.step, flip);

  const viewSwitch = (
    <div className="flex h-10 shrink-0 items-center justify-between gap-3">
      <SegmentedControl
        aria-label="View"
        options={[
          { value: "home", label: "Home" },
          { value: "map", label: "Map" },
          { value: "board", label: "Board" },
        ]}
        value={pos.view === "drill" ? drillFrom : pos.view}
        onChange={(v) => pos.setView(v)}
      />
      {pos.view === "map" && (
        <MapTrail
          parent={
            showSmall
              ? mapOpen
                ? splitName(mapOpen.folder.name).label
                : "All openings"
              : mapOpen
                ? mapParent
                  ? splitName(mapParent.folder.name).label
                  : "All openings"
                : null
          }
          current={
            showSmall
              ? "Rare Replies"
              : mapOpen
                ? splitName(mapOpen.folder.name).label
                : "All openings"
          }
          onUp={() => {
            if (showSmall) {
              setSmallAt(null);
              return;
            }
            if (!mapOpen) return;
            setSelectedId(mapOpen.folder.id);
            pos.open(pos.color, mapParent ? mapParent.folder.moves : []);
          }}
        />
      )}
      {pos.view === "drill" ? (
        <Button variant="ghost" size="sm" onClick={() => pos.setView(drillFrom)}>
          Back
        </Button>
      ) : (
        // On the map and home the folder panel has the drill; the board's rail doesn't.
        pos.view === "board" && (
          <div className="flex items-center gap-2">
            <BoardTools ply={pos.ply} length={pos.line.length} onGoTo={pos.goTo} onFlip={flip} />
            {scopeId && (
              <Button
                variant="primary"
                size="sm"
                disabled={learning.cardsIn(scopeId).length === 0}
                onClick={() => startDrill(scopeId)}
              >
                {scopeDue > 0 ? `Drill · ${scopeDue} due` : "Drill"}
              </Button>
            )}
          </div>
        )
      )}
    </div>
  );

  const board = (
    <div className="flex items-center gap-2">
      {size > 0 && (
        <div className="flex flex-col items-center gap-1" style={{ height: size }}>
          <EvalBar score={score} orientation={orientation} height={size - 22} />
          <span
            className={cn(
              "font-mono text-3xs leading-none tabular-nums",
              (evaluation?.depth ?? 0) >= 50 ? "text-emerald-300" : "text-fg-muted",
            )}
            title={
              evaluation ? `Depth ${evaluation.depth} · ${evaluation.source}` : "No evaluation yet"
            }
          >
            {evaluation ? `d${evaluation.depth}` : evalLoading ? "…" : "—"}
          </span>
        </div>
      )}
      <div style={{ width: size, height: size }}>
        {size > 0 && (
          <ChessBoard
            className="size-full overflow-hidden rounded-card-md shadow-lg"
            fen={pos.here.fen}
            orientation={orientation}
            moves={moves}
            onMove={pos.play}
            keyboard={false}
            lastMove={last?.uci ?? null}
            arrows={arrows}
            aria-label={`Opening board, ${pos.here.fen.split(" ")[1] === "b" ? "Black" : "White"} to move`}
          />
        )}
      </div>
    </div>
  );

  const sidebar =
    pos.view === "home" ? undefined : pos.view === "board" ? (
      <ExplorerRail
        fen={pos.here.fen}
        node={node}
        tree={tree}
        line={pos.line}
        ply={pos.ply}
        onPlay={pos.play}
        onGoTo={pos.goTo}
        onPlayLine={pos.playLine}
        evaluation={evaluation}
        evalLoading={evalLoading}
        color={pos.color}
        positionStats={build?.positionStats ?? null}
        providers={providers}
        transposition={build?.transposition ?? null}
        footer={<ChoiceCard makeMine={makeMine} engineBest={engineBest} busy={busy} />}
      />
    ) : pos.view === "drill" ? (
      <DrillRail
        session={session}
        schedule={schedule}
        scope={drillPlaced ? splitName(drillPlaced.folder.name).label : "All your moves"}
        scopeLearning={
          drillPlaced
            ? (learning.byFolder.get(drillPlaced.folder.id) ?? emptyLearning())
            : learning.total
        }
        node={drillKey ? (drillTree?.nodes[drillKey] ?? null) : null}
        route={drillRoute}
      />
    ) : (
      <FolderPanel
        title={panelTitle}
        learning={panelLearning}
        cards={panelCards}
        states={schedule.states}
        tree={trees[pos.color]}
        farm={build?.farm ?? null}
        onDrill={() => startDrill(panel?.folder.id ?? null)}
        onBoard={panel ? () => pos.setView("board", { moves: panel.folder.moves }) : null}
        onOpen={
          selected && selected.folder.children.length > 0
            ? () => {
                pos.open(pos.color, selected.folder.moves);
                setSelectedId(null);
              }
            : null
        }
        onShowLine={(key) => {
          const t = trees[pos.color];
          const route = t ? routeTo(t, key) : null;
          if (!route) return;
          pos.setView("board", { moves: route.map((r) => r.uci) });
        }}
      />
    );

  return (
    <GameScreen
      leftSidebarLabel="Folders"
      leftSidebarWidth="wide"
      leftSidebar={
        <FolderRail
          trees={trees}
          color={pos.color}
          onColor={pos.setColor}
          moves={pos.line.slice(0, pos.ply)}
          onOpen={pos.open}
          folderGames={folderGames}
          learning={learning.byFolder}
          build={build}
          notice={notice}
          footer={<ConnectionBar link={link} token={token} importer={importer} builds={builds} />}
        />
      }
      sidebarTitle={pos.view === "board" ? "Analysis" : pos.view === "drill" ? "Session" : "Folder"}
      sidebarWidth="explorer"
      sidebar={sidebar}
    >
      {viewSwitch}
      {/* One container in every view: the board measures it once, when it first mounts. */}
      <div
        ref={fitRef}
        className={cn(
          "flex min-h-0 flex-1",
          pos.view === "board" || pos.view === "drill" ? "items-center justify-center" : "flex-col",
        )}
      >
        {pos.view === "home" ? (
          <TrainerHome
            color={pos.color}
            folders={leaves.map((p) => ({
              placed: p,
              l: learning.byFolder.get(p.folder.id) ?? emptyLearning(),
              games: popularity.get(p.folder.id)?.games ?? null,
            }))}
            overview={schedule.overview}
            onDrill={(id) => startDrill(id)}
            onShowMap={showOnMap}
            onShowBoard={(p) => pos.setView("board", { moves: p.folder.moves })}
            waitingIn={learning.waitingIn}
            farmQueue={farmQueue}
            loading={
              // A tree on its way (stored, or building with lichess connected), or
              // the schedule still loading: never "nothing to study" meanwhile.
              (!!build && !!token && !trees[pos.color]) || (!schedule.states && !schedule.error)
            }
          />
        ) : pos.view === "map" ? (
          <AtlasMap
            folders={level}
            learning={learning.byFolder}
            games={folderGames.counts}
            blocked={learning.blocked}
            popularity={popularity}
            selected={selected?.folder.id ?? null}
            onSelect={setSelectedId}
            onOpen={(p) => {
              pos.open(pos.color, p.folder.moves);
              setSelectedId(null);
            }}
            showSmall={showSmall}
            onShowSmall={() => setSmallAt(levelId)}
          />
        ) : pos.view === "board" ? (
          board
        ) : (
          <DrillBoard
            session={session}
            color={pos.color}
            size={Math.max(0, size - 72)}
            route={drillRoute}
            folderOf={folderOf}
            loading={!schedule.states && !schedule.error}
          />
        )}
      </div>
    </GameScreen>
  );
}

/** The build's last finished tree, kept while a rebuild runs (its first tree if none finished yet). */
function useSettledTree(build: TreeBuild | null): RepertoireTree | null {
  const tree = build?.tree ?? null;
  const settled = useRef(tree);
  if (build?.phase === "idle" || !settled.current) settled.current = tree;
  return settled.current;
}

/** Start each colour's build once when the screen opens, unless it's complete. */
function useAutoBuild(builds: Record<Color, TreeBuild | null>, canBuild: boolean) {
  const started = useRef<Record<Color, boolean>>({ w: false, b: false });
  useEffect(() => {
    if (!canBuild) return;
    for (const c of ["w", "b"] as const) {
      const b = builds[c];
      if (!b || started.current[c] || b.phase !== "idle") continue;
      const status = b.tree?.status;
      started.current[c] = true;
      if (!b.tree || status === "generating" || status === "analysing") b.build();
    }
  }, [builds, canBuild]);
}

/**
 * Your moves fixed in code (`fixedChoices`: 1.e4 as White, and your moves into the
 * farm's folders such as 3.Bb5 into the Ruy Lopez): set on the
 * tree once it exists and the build is idle, then rebuilt from there.
 */
function useFixedChoices(builds: Record<Color, TreeBuild | null>) {
  useEffect(() => {
    for (const c of ["w", "b"] as const) {
      const b = builds[c];
      const tree = b?.tree;
      if (!b || !tree || b.phase !== "idle" || !b.providers) continue;
      let next = tree;
      for (const fixed of fixedChoices(c)) {
        const key = walkLine(fixed.moves).at(-1)?.key ?? START.key;
        const node = next.nodes[key];
        if (!node || node.side !== "user") continue;
        if (node.choice?.source === "handpicked" && node.choice.uci === fixed.uci) continue;
        next = withChoice(next, key, { source: "handpicked", uci: fixed.uci });
      }
      if (next !== tree) b.build(next);
    }
  }, [builds]);
}

const apply = (b: TreeBuild, tree: RepertoireTree, key: string, choice: UserChoice | null) =>
  b.build(withChoice(tree, key, choice));

/**
 * Setting your move at a position: rebuilt at once when the build is idle,
 * else after it pauses.
 */
function useChoices(builds: Record<Color, TreeBuild | null>) {
  const [pending, setPending] = useState<{
    color: Color;
    key: string;
    choice: UserChoice | null;
  } | null>(null);

  const choose = (color: Color, key: string, choice: UserChoice | null) => {
    const b = builds[color];
    if (!b?.tree) return;
    if (b.phase === "idle") {
      apply(b, b.tree, key, choice);
      return;
    }
    setPending({ color, key, choice });
    b.stop();
  };

  useEffect(() => {
    if (!pending) return;
    const b = builds[pending.color];
    if (!b?.tree || b.phase !== "idle") return;
    setPending(null);
    apply(b, b.tree, pending.key, pending.choice);
  }, [pending, builds]);

  return { choose, busy: pending !== null };
}
