/**
 * Browsing an opening tree: a board and the moves from the shown position
 * (yours: the one move; the opponent's: every reply, with where each came
 * from). Your position also shows where your games left the tree, and can
 * take a different move — the tree is rebuilt from there.
 */
import type {
  RepertoireTree,
  TreeMove,
  TreeMoveSource,
  UserChoice,
} from "@boardgames/core/games/chess/trainer/tree";
import { useState } from "react";
import { Badge, type BadgeTone, Button, Surface } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import ChessBoard, { type BoardArrow } from "../components/board/ChessBoard";
import {
  keyAfter,
  legalUcis,
  moveLabel,
  routeTo,
  type Step,
  sanOf,
  scoreText,
  topDeviations,
} from "./tree-nav";

const SOURCE_NAME: Record<string, string> = {
  "lichess-cloud": "lichess cloud",
  "lichess-dump": "lichess cloud",
  chessdb: "ChessDB",
};

const SOURCE: Record<TreeMoveSource, { label: string; tone: BadgeTone; title: string }> = {
  handpicked: { label: "Your pick", tone: "amber", title: "You chose this move" },
  best: { label: "Best", tone: "amber", title: "You chose the engine's best move" },
  engine: { label: "Engine", tone: "sky", title: "The engine's choice" },
  played: { label: "Played", tone: "emerald", title: "Played against you" },
  popular: { label: "Popular", tone: "accent", title: "The lichess database's popular move" },
};

interface Props {
  readonly tree: RepertoireTree;
  readonly editable: boolean;
  readonly onChange: (key: string, choice: UserChoice) => void;
}

export function TreeBrowser({ tree, editable, onChange }: Props) {
  const [route, setRoute] = useState<Step[]>([]);
  const [changing, setChanging] = useState(false);
  const key = route.at(-1)?.key ?? tree.root;
  const node = tree.nodes[key];
  // A rebuild can drop the shown position; fall back to the start.
  if (!node) {
    if (route.length > 0) setRoute([]);
    return null;
  }
  const ply = route.length;

  const go = (m: TreeMove) => {
    const next = keyAfter(node.fen, m.uci);
    if (!next || !tree.nodes[next]) return;
    setChanging(false);
    setRoute([...route, { uci: m.uci, san: m.san, key: next }]);
  };
  const back = (to: number) => {
    setChanging(false);
    setRoute(route.slice(0, to));
  };
  const jump = (target: string) => {
    const r = routeTo(tree, target);
    if (r) {
      setChanging(false);
      setRoute(r);
    }
  };

  const arrows: BoardArrow[] = node.moves.flatMap((m) =>
    m.uci.length >= 4
      ? [
          {
            from: m.uci.slice(0, 2),
            to: m.uci.slice(2, 4),
            tone: node.side === "user" ? "best" : "alt",
          } as const,
        ]
      : [],
  );
  const boardMoves = changing
    ? legalUcis(node.fen)
    : node.moves.filter((m) => tree.nodes[keyAfter(node.fen, m.uci) ?? ""]).map((m) => m.uci);
  const onBoardMove = (uci: string) => {
    if (changing) {
      setChanging(false);
      onChange(key, { source: "handpicked", uci });
      return;
    }
    const m = node.moves.find((x) => x.uci === uci);
    if (m) go(m);
  };
  const deviations = topDeviations(tree);
  const best = node.engine?.[0];

  return (
    <Surface variant="raised" padding="lg" className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-fg-strong">The tree</h2>
      <nav aria-label="Line" className="flex flex-wrap items-center gap-1 text-sm">
        <Button variant="ghost" size="xs" onClick={() => back(0)} aria-current={ply === 0}>
          Start
        </Button>
        {route.map((s, i) => (
          <Button
            key={route
              .slice(0, i + 1)
              .map((r) => r.uci)
              .join(" ")}
            variant="ghost"
            size="xs"
            onClick={() => back(i + 1)}
            className={cn(i === route.length - 1 && "text-fg-strong")}
          >
            {moveLabel(i, s.san)}
          </Button>
        ))}
      </nav>

      <div className="grid gap-4 md:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="aspect-square w-full">
          <ChessBoard
            className="size-full overflow-hidden rounded-card-md"
            fen={node.fen}
            orientation={tree.color}
            moves={boardMoves}
            onMove={onBoardMove}
            lastMove={route.at(-1)?.uci ?? null}
            arrows={changing ? [] : arrows}
            aria-label="Opening tree position"
          />
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
            <span className="font-semibold text-fg-strong">
              {node.side === "user" ? "Your move" : "Their replies"}
            </span>
            <span>
              · {node.seen.toLocaleString()} of your games reached this position
              {node.following > 0
                ? `, ${node.following.toLocaleString()} still following the tree`
                : ""}
            </span>
            {best && (
              <span
                title={
                  node.evalSpec ? `${node.evalSpec}, ${node.evalSource ?? "farm"}` : "Quick search"
                }
              >
                · engine {scoreText(node.fen, best)} at depth {best.depth}
                {node.evalSource && node.evalSource !== "farm"
                  ? ` (${SOURCE_NAME[node.evalSource] ?? node.evalSource})`
                  : ""}
              </span>
            )}
            {node.contested && (
              <Badge
                tone="rose"
                size="xs"
                title="Leela prefers a move Stockfish rates clearly worse"
              >
                Contested
              </Badge>
            )}
          </div>

          {node.status === "terminal" ? (
            <p className="text-sm text-fg-muted">The game is over here.</p>
          ) : node.status === "decision" ? (
            <p className="text-sm text-fg-muted">Waiting for your choice above.</p>
          ) : node.status === "awaiting-eval" ? (
            <p className="text-sm text-fg-muted">
              The analysis farm hasn't reached this position yet.
            </p>
          ) : node.moves.length === 0 ? (
            <p className="text-sm text-fg-muted">Not worked out yet — continue the build.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {node.moves.map((m) => {
                const hasChild = !!tree.nodes[keyAfter(node.fen, m.uci) ?? ""];
                return (
                  <li key={m.uci}>
                    <Button
                      variant="secondary"
                      size="sm"
                      block
                      align="start"
                      disabled={!hasChild}
                      onClick={() => go(m)}
                    >
                      <span className="w-16 font-bold text-fg-strong">{m.san}</span>
                      <Badge tone={SOURCE[m.source].tone} size="xs" title={SOURCE[m.source].title}>
                        {SOURCE[m.source].label}
                      </Badge>
                      <span className="ml-auto text-xs text-fg-muted">
                        {m.games > 0
                          ? `${m.games.toLocaleString()} games`
                          : "never played against you"}
                        {!hasChild && " · line ends"}
                      </span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          {node.side === "user" && (node.ties ?? []).length > 1 && (
            <div className="text-sm text-fg-secondary">
              <p className="font-semibold text-fg-primary">
                Stockfish rates these equal — Leela chose
              </p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {(node.ties ?? []).map((uci) => {
                  const s = node.lc0?.find((m) => m.uci === uci);
                  return (
                    <li key={uci} className={cn(uci === node.moves[0]?.uci && "text-fg-strong")}>
                      {sanOf(node.fen, uci)}
                      {s
                        ? ` — win ${Math.round(s.w * 100)}%, draw ${Math.round(s.d * 100)}%, loss ${Math.round(s.l * 100)}%`
                        : ""}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {node.side === "user" && (node.deviations ?? []).length > 0 && (
            <div className="text-sm text-fg-secondary">
              <p className="font-semibold text-fg-primary">Where your games left the tree here</p>
              <p>{(node.deviations ?? []).map((d) => `${d.san} ×${d.games}`).join(", ")}</p>
            </div>
          )}
          {(node.ended ?? 0) > 0 && (
            <p className="text-sm text-fg-muted">
              {node.ended} {node.ended === 1 ? "game" : "games"} ended in this position.
            </p>
          )}

          {node.side === "user" && editable && node.status !== "terminal" && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={changing ? "secondary" : "ghost"}
                onClick={() => setChanging(!changing)}
              >
                {changing ? "Cancel — keep this move" : "Change my move here"}
              </Button>
              {changing && (
                <Button size="sm" variant="ghost" onClick={() => onChange(key, { source: "best" })}>
                  Use the engine's best
                </Button>
              )}
            </div>
          )}
          {changing && (
            <p className="text-sm text-fg-muted">
              Play the move you want on the board. The tree is rebuilt from this position.
            </p>
          )}
        </div>
      </div>

      {deviations.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <h3 className="text-sm font-semibold text-fg-primary">Where you leave the tree most</h3>
          <ul className="flex flex-col gap-1">
            {deviations.map((d) => {
              const r = routeTo(tree, d.key) ?? [];
              const played = (d.node.deviations ?? [])
                .map((x) => `${x.san} ×${x.games}`)
                .join(", ");
              return (
                <li key={d.key}>
                  <Button variant="ghost" size="sm" align="start" block onClick={() => jump(d.key)}>
                    <span className="text-fg-strong">
                      {r.length === 0 ? "Move 1" : r.map((s, i) => moveLabel(i, s.san)).join(" ")}
                    </span>
                    <span className="ml-auto text-xs text-fg-muted">
                      tree says {d.node.moves[0]?.san ?? "—"}; you played {played}
                    </span>
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Surface>
  );
}
