/**
 * A position of yours inside your handpicked moves: choose what you play
 * here — the engine's best, or any move (play it on the board or pick one of
 * the suggestions: what you've played before, the engine's lines, what the
 * lichess database plays most).
 */
import type {
  EngineLine,
  PopularMove,
  RepertoireTree,
  UserChoice,
} from "@boardgames/core/games/chess/trainer/tree";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Spinner, Surface } from "../../../components/ui";
import ChessBoard from "../components/board/ChessBoard";
import type { TrainerProviders } from "./engine-provider";
import { legalUcis, moveLabel, routeTo, sanOf, scoreText } from "./tree-nav";

const SUGGESTIONS = 5;

interface Props {
  readonly tree: RepertoireTree;
  readonly nodeKey: string;
  /** Positions still waiting, this one included. */
  readonly remaining: number;
  readonly providers: TrainerProviders | null;
  /** A choice is on its way in (the build is pausing to take it). */
  readonly busy: boolean;
  readonly onChoose: (choice: UserChoice) => void;
}

export function DecisionPanel({ tree, nodeKey, remaining, providers, busy, onChoose }: Props) {
  const node = tree.nodes[nodeKey];
  const route = useMemo(() => routeTo(tree, nodeKey) ?? [], [tree, nodeKey]);
  const [engine, setEngine] = useState<EngineLine[] | null>(node?.engine ?? null);
  const [popular, setPopular] = useState<PopularMove[] | null>(node?.popular ?? null);
  const fen = node?.fen ?? "";
  const depth = tree.settings.engineDepth;

  useEffect(() => {
    if (!providers || !fen) return;
    let live = true;
    if (!engine || engine.length < 3) {
      providers
        .engineLines(fen, 3, depth)
        .then((l) => live && setEngine(l))
        .catch(() => live && setEngine([]));
    }
    if (!popular) {
      providers
        .popularMoves(fen)
        .then((p) => live && setPopular(p))
        .catch(() => live && setPopular([]));
    }
    return () => {
      live = false;
    };
  }, [providers, fen, depth, engine, popular]);

  if (!node) return null;
  const legal = legalUcis(fen);
  const pick = (uci: string) => onChoose({ source: "handpicked", uci });
  const totalPopular = (popular ?? []).reduce((n, p) => n + p.games, 0);

  return (
    <Surface variant="raised" padding="lg" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-fg-strong">Your move</h2>
        <Badge tone="amber" size="xs">
          {remaining} {remaining === 1 ? "position" : "positions"} waiting
        </Badge>
        <span className="text-sm text-fg-muted">
          {node.following.toLocaleString()} of your games reached this position
        </span>
      </div>
      <p className="text-sm text-fg-secondary">
        {route.length === 0
          ? "The starting position."
          : route.map((s, i) => moveLabel(i, s.san)).join(" ")}
      </p>
      <div className="grid gap-4 md:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="aspect-square w-full">
          <ChessBoard
            className="size-full overflow-hidden rounded-card-md"
            fen={fen}
            orientation={tree.color}
            moves={busy ? [] : legal}
            onMove={pick}
            lastMove={route.at(-1)?.uci ?? null}
            aria-label="Choose your move on the board"
          />
        </div>
        <div className="flex flex-col gap-4">
          <Button onClick={() => onChoose({ source: "best" })} disabled={busy}>
            Play the engine's best move here
          </Button>

          <Suggestions title="You have played">
            {(node.history ?? []).length === 0 ? (
              <p className="text-sm text-fg-muted">
                Never — no game of yours reached this position.
              </p>
            ) : (
              (node.history ?? []).slice(0, SUGGESTIONS).map((h) => (
                <MoveButton key={h.uci} disabled={busy} onClick={() => pick(h.uci)} san={h.san}>
                  {h.games}× · {Math.round((h.score / h.games) * 100)}% score
                </MoveButton>
              ))
            )}
          </Suggestions>

          <Suggestions title="Engine">
            {engine === null ? (
              <Spinner />
            ) : (
              engine.map((l) => (
                <MoveButton
                  key={l.uci}
                  disabled={busy}
                  onClick={() => pick(l.uci)}
                  san={sanOf(fen, l.uci)}
                >
                  {scoreText(fen, l)} · depth {l.depth}
                </MoveButton>
              ))
            )}
          </Suggestions>

          <Suggestions title="lichess database">
            {popular === null ? (
              <Spinner />
            ) : popular.length === 0 ? (
              <p className="text-sm text-fg-muted">No database games from here.</p>
            ) : (
              popular.slice(0, SUGGESTIONS).map((p) => (
                <MoveButton
                  key={p.uci}
                  disabled={busy}
                  onClick={() => pick(p.uci)}
                  san={sanOf(fen, p.uci)}
                >
                  {Math.round((p.games / Math.max(1, totalPopular)) * 100)}% ·{" "}
                  {p.games.toLocaleString()} games
                </MoveButton>
              ))
            )}
          </Suggestions>
        </div>
      </div>
    </Surface>
  );
}

function Suggestions({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold text-fg-muted uppercase">{title}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function MoveButton({
  san,
  onClick,
  disabled,
  children,
}: {
  san: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick} disabled={disabled}>
      <span className="font-bold text-fg-strong">{san}</span>
      <span className="text-xs text-fg-muted">{children}</span>
    </Button>
  );
}
