/**
 * The opening trainer's one screen: your folders on the left, the board in
 * the middle, the move explorer on the right. Moves on the board are free —
 * explore anything; where it's your move in your tree, ★ makes the move you
 * just played yours and the tree regrows from there. Both colours' trees build
 * in the background as soon as the screen opens.
 */
import { FIXED_CHOICES } from "@boardgames/core/games/chess/trainer/folders";
import {
  type RepertoireTree,
  type UserChoice,
  withChoice,
} from "@boardgames/core/games/chess/trainer/tree";
import type { LichessLink } from "@boardgames/core/protocol";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import GameScreen from "../../../../components/game-layout/GameScreen";
import { cn } from "../../../../lib/cn";
import { EvalBar } from "../../analysis/EvalBar";
import type { Score } from "../../analysis/grade";
import ChessBoard, { type BoardArrow } from "../../components/board/ChessBoard";
import { useSquareFit } from "../../logic/board-view";
import { TrainerProviders } from "../engine-provider";
import { legalUcis } from "../tree-nav";
import type { ImportState } from "../useLichessImport";
import type { TreeBuild } from "../useTreeBuild";
import { BuildStatus } from "./BuildStatus";
import { ConnectionBar } from "./ConnectionBar";
import { ExplorerRail } from "./ExplorerRail";
import { FolderRail } from "./FolderRail";
import { KIND_OF } from "./markers";
import { lineValue, START, walkLine } from "./model";
import { TrainerActions } from "./TrainerActions";
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
    FIXED_CHOICES[pos.color].some((f) => f.moves.join(" ") === moves.map((m) => m.uci).join(" "));
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
          folderCounts={build?.folderCounts ?? null}
          status={
            <>
              {notice}
              <BuildStatus build={build} />
            </>
          }
          footer={<ConnectionBar link={link} token={token} importer={importer} builds={builds} />}
        />
      }
      sidebarTitle="Analysis"
      sidebarWidth="explorer"
      sidebar={
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
        />
      }
      actionBar={
        <TrainerActions
          ply={pos.ply}
          length={pos.line.length}
          onGoTo={pos.goTo}
          onStep={pos.step}
          onFlip={() => setOrientation((o) => (o === "w" ? "b" : "w"))}
          makeMine={makeMine}
          engineBest={engineBest}
          busy={busy}
        />
      }
    >
      <div ref={fitRef} className="flex min-h-0 flex-1 items-center justify-center">
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
                  evaluation
                    ? `Depth ${evaluation.depth} · ${evaluation.source}`
                    : "No evaluation yet"
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
 * Your moves fixed in code (`FIXED_CHOICES`, e.g. 1.e4 as White): set on the
 * tree once it exists and the build is idle, then rebuilt from there.
 */
function useFixedChoices(builds: Record<Color, TreeBuild | null>) {
  useEffect(() => {
    for (const c of ["w", "b"] as const) {
      const b = builds[c];
      const tree = b?.tree;
      if (!b || !tree || b.phase !== "idle" || !b.providers) continue;
      let next = tree;
      for (const fixed of FIXED_CHOICES[c]) {
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
