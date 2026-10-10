import type { Color } from "@boardgames/core/games/chess/engine/types";
import type {
  BughouseAction,
  BughousePlayerView,
} from "@boardgames/core/games/chess-bughouse/schemas";
import { useEffect, useMemo, useState } from "react";
import { GameScreen } from "../../../components/game-layout";
import { Button, Eyebrow, Surface, useConfirm } from "../../../components/ui";
import ChessBoard from "../../chess/components/board/ChessBoard";
import { PlayerStrip } from "../../chess/components/PlayerStrip";
import { useBox } from "../../chess/logic/board-view";
import { pocketsOf } from "../../chess/logic/moves";
import { playSound, readMuted, soundForSan } from "../../chess/logic/sound";
import { PocketTray } from "./PocketTray";
import { SIGNAL_TEXT } from "./signals";

/** Seat on `board` playing `color` (0 = A-White … 3 = B-Black). */
const seatAt = (board: 0 | 1, color: Color) => board * 2 + (color === "w" ? 0 : 1);
const other = (c: Color): Color => (c === "w" ? "b" : "w");
const BOARD_NAME = ["Board A", "Board B"] as const;

/** Two strips + two pockets around each board. */
const CHROME_H = 2 * (48 + 32) + 24;
const SIDE_BY_SIDE_MIN_W = 720;

interface Props {
  view: BughousePlayerView;
  names: readonly string[];
  legal: readonly BughouseAction[];
  send: (action: BughouseAction) => void;
}

/**
 * Bughouse: your board and your partner's side by side (stacked on phones).
 * Your partner's board is turned so they sit at the bottom too — both of you
 * face the same way, as across a real table.
 */
export default function BughouseBoard({ view, names, legal, send }: Props) {
  const [box, { width, height }] = useBox<HTMLDivElement>();
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [premove, setPremove] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const myBoard = view.board;
  const partnerBoard: 0 | 1 = myBoard === 0 ? 1 : 0;
  const mine = view.boards[myBoard];
  const myTurn = !view.result && mine.fen.split(" ")[1] === view.color;
  const moves = useMemo(() => legal.flatMap((a) => (a.kind === "move" ? [a.uci] : [])), [legal]);
  const droppable = useMemo(
    () => new Set(moves.filter((m) => m.includes("@")).map((m) => m.slice(0, 2))),
    [moves],
  );

  useEffect(() => {
    if (!premove || !myTurn) return;
    if (moves.includes(premove)) send({ kind: "move", uci: premove });
    setPremove(null);
  }, [premove, myTurn, moves, send]);

  // A move on your own board clicks; your partner's board stays quiet.
  const plies = mine.history.length;
  const [heard, setHeard] = useState(plies);
  useEffect(() => {
    if (plies > heard && !readMuted()) {
      const last = mine.history[plies - 1];
      if (last) playSound(soundForSan(last.san, last.captured !== null));
    }
    setHeard(plies);
  }, [plies, heard, mine.history]);

  const sideBySide = width >= SIDE_BY_SIDE_MIN_W;
  const size = Math.max(
    0,
    Math.floor(
      sideBySide
        ? Math.min((width - 24) / 2, height - CHROME_H)
        : Math.min(width, Math.max(height - CHROME_H, 0) || width),
    ),
  );

  const column = (board: 0 | 1, bottom: Color, interactive: boolean) => {
    const b = view.boards[board];
    const pockets = pocketsOf(b.fen);
    const toMove: Color = b.fen.split(" ")[1] === "b" ? "b" : "w";
    const strip = (c: Color) => {
      const seat = seatAt(board, c);
      return (
        <div className="flex flex-col gap-0.5">
          <PlayerStrip
            name={names[seat] ?? "Player"}
            color={c}
            isAi={view.aiSeats.includes(seat)}
            thinking={b.aiThinking && toMove === c}
            taken={[]}
            lead={0}
            clock={b.clock}
            disconnected={view.disconnected.includes(seat)}
            toMove={!view.result && toMove === c}
          />
          <PocketTray
            pockets={pockets}
            color={c}
            picked={interactive && c === view.color ? dropKey : null}
            onPick={interactive && c === view.color && myTurn ? setDropKey : undefined}
            droppable={droppable}
          />
        </div>
      );
    };
    return (
      <section
        className="flex flex-col gap-1"
        style={{ width: size }}
        aria-label={BOARD_NAME[board]}
      >
        <Eyebrow size="sm" tone="neutral">
          {BOARD_NAME[board]}
          {board === myBoard ? " · you" : " · partner"}
        </Eyebrow>
        {strip(other(bottom))}
        <div style={{ width: size, height: size }}>
          {size > 0 && (
            <ChessBoard
              bughouse
              className="size-full overflow-hidden rounded-card-md shadow-lg"
              fen={b.fen}
              orientation={bottom}
              moves={interactive && myTurn ? moves : []}
              onMove={(uci) => send({ kind: "move", uci })}
              premoveColor={interactive && !view.result && !myTurn ? view.color : null}
              premove={interactive ? premove : null}
              onPremove={interactive ? setPremove : undefined}
              dropKey={interactive ? dropKey : null}
              onDropKeyChange={interactive ? setDropKey : undefined}
              lastMove={b.history.at(-1)?.uci ?? null}
              aria-label={`${BOARD_NAME[board]}, ${toMove === "w" ? "White" : "Black"} to move`}
            />
          )}
        </div>
        {strip(bottom)}
      </section>
    );
  };

  const signals = legal.filter(
    (a): a is Extract<BughouseAction, { kind: "signal" }> => a.kind === "signal",
  );
  const resign = legal.find((a) => a.kind === "resign");
  const claimWin = legal.find((a) => a.kind === "claim-win");
  const lastFromPartner = [...view.signals].reverse().find((s) => s.seat === view.partner);

  return (
    <GameScreen
      sidebar={
        <div className="flex flex-col gap-2 text-sm">
          <Eyebrow size="sm" tone="neutral">
            Team talk
          </Eyebrow>
          {view.signals.length === 0 && <p className="text-fg-muted">Nothing yet.</p>}
          <ol className="flex flex-col gap-1">
            {view.signals.map((s) => (
              <li key={`${s.at}-${s.seat}-${s.code}`} className="text-fg-secondary">
                <span className="font-semibold text-fg-primary">
                  {s.seat === view.seat ? "You" : (names[s.seat] ?? "Partner")}
                </span>{" "}
                {SIGNAL_TEXT[s.code].said}
              </li>
            ))}
          </ol>
        </div>
      }
      actionBar={
        <Surface
          variant="raised"
          padding="sm"
          className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 whitespace-nowrap"
        >
          <div className="flex flex-wrap items-center gap-1">
            {signals.map((s) => (
              <Button
                key={s.code}
                size="xs"
                variant="secondary"
                onClick={() => send(s)}
                title={SIGNAL_TEXT[s.code].tip}
              >
                {SIGNAL_TEXT[s.code].button}
              </Button>
            ))}
          </div>
          {lastFromPartner && (
            <span className="sr-only" aria-live="polite">
              Partner {SIGNAL_TEXT[lastFromPartner.code].said}
            </span>
          )}
          <div className="flex items-center gap-2">
            {claimWin && (
              <Button
                size="xs"
                variant="success"
                onClick={() => send(claimWin)}
                title="An opponent left a minute ago — claim the win"
              >
                Claim victory
              </Button>
            )}
            {resign && (
              <Button
                size="xs"
                variant="danger"
                title="Resign for your team"
                onClick={async () => {
                  if (
                    await confirm({
                      title: "Resign for your team?",
                      description: "Both boards end; the other team wins.",
                      confirmLabel: "Resign",
                    })
                  )
                    send(resign);
                }}
              >
                ⚑ Resign
              </Button>
            )}
          </div>
          {confirmDialog}
        </Surface>
      }
    >
      <div ref={box} className="flex min-h-0 flex-1 items-center justify-center">
        <div className={sideBySide ? "flex items-start gap-6" : "flex flex-col gap-6"}>
          {column(myBoard, view.color, true)}
          {column(partnerBoard, other(view.color), false)}
        </div>
      </div>
    </GameScreen>
  );
}
