import type { CardId, SensoPlayerView } from "@boardgames/core/games/senso-battle-for-japan/types";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CardPreview, useHoverPreview } from "../../../../components/card-fan";
import { cn } from "../../../../lib/cn";
import { activeSeatOf } from "../../logic/active-seat";
import { cardSpokenLabel } from "../../logic/cards";
import { seatShortLabel } from "../../logic/seat-labels";
import { useMapOrientation } from "../board/orientation";
import SensoCard from "../SensoCard";
import CardSlot from "./CardSlot";
import SeatPlate from "./SeatPlate";
import TableCentre from "./TableCentre";
import TableFelt from "./TableFelt";
import {
  type Point,
  relativeSeat,
  seatPositions,
  TABLE_LAYOUTS,
  type TableOrientation,
} from "./table-geometry";
import { useSettleSweep, useTableReducedMotion } from "./table-motion";
import { statusLine } from "./table-status";

interface Props {
  view: SensoPlayerView;
  names: readonly (string | null)[];
  /**
   * `box` — fill the box the parent gives (wide screens: the whole Table
   * face). `width` — as wide as the parent, as tall as the canvas' aspect
   * (phones: the page scrolls, like the map).
   */
  fit?: "box" | "width";
  /** Force a canvas (the dev preview); defaults to the viewport. */
  orientation?: TableOrientation;
  className?: string;
}

/** The largest uniform scale at which the canvas fits the box. */
function fitScale(box: { w: number; h: number }, canvas: { w: number; h: number }): number {
  if (box.w <= 0 || box.h <= 0) return 1;
  return Math.min(box.w / canvas.w, box.h / canvas.h);
}

/**
 * The conflict table: a fixed design canvas (a photographed tabletop) scaled
 * uniformly to its box. Seats sit around the cloth in seat order, clockwise,
 * the viewer at the bottom; each seat has a plate outside the rim and a slot
 * on the cloth where its card always lands. The centre shows the trump, the
 * advantage row and the one status line.
 */
export default function TrickTable({ view, names, fit = "box", orientation, className }: Props) {
  const layout = TABLE_LAYOUTS[useMapOrientation(orientation)];
  const reduce = useTableReducedMotion();
  const n = view.players.length;
  const positions = useMemo(() => seatPositions(layout, n), [layout, n]);
  const kOf = (seat: number) => relativeSeat(seat, view.me, n);

  // Measure the box and scale the canvas into it. jsdom reports 0×0 → scale 1.
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = fitScale(box, layout.canvas);
  const offset = {
    x: Math.max(0, (box.w - layout.canvas.w * scale) / 2),
    y: Math.max(0, (box.h - layout.canvas.h * scale) / 2),
  };

  // The trick on the cloth: while settling, the completed trick stays down.
  const settling = view.phase === "trick-settle" && view.completedTrick !== null;
  const plays = view.completedTrick?.plays ?? view.table;
  const winner = settling ? (view.completedTrick?.winner ?? null) : null;

  // Where the cards sweep to. Captured at settle so it survives the server
  // clearing the table (the exit animation runs after `view.table` is empty).
  const settleKey = settling ? `${view.round}:${view.trickNumber}` : null;
  const winnerPos = winner !== null ? positions[kOf(winner)] : undefined;
  const settleRef = useRef<Point | null>(null);
  useEffect(() => {
    if (winnerPos) settleRef.current = winnerPos.plate;
  }, [winnerPos]);
  const fallbackWinner = view.lastTrick?.winner ?? null;
  const winnerPlate =
    winnerPos?.plate ??
    settleRef.current ??
    (fallbackWinner !== null ? (positions[kOf(fallbackWinner)]?.plate ?? null) : null);
  const sweeping = useSettleSweep(settleKey, reduce);

  const activeSeat = activeSeatOf(view);
  const status = statusLine(view, names, settling, !layout.trumpCardInCentre);
  // Holding the pointer on a played card opens the same large preview as the hand.
  const preview = useHoverPreview<CardId>();

  const canvasStyle = {
    width: layout.canvas.w,
    height: layout.canvas.h,
    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
    transformOrigin: "0 0",
  };

  return (
    <div
      ref={boxRef}
      data-testid="trick-table"
      className={cn(
        "relative overflow-hidden",
        fit === "box" ? "min-h-0 flex-1" : "w-full",
        className,
      )}
      style={fit === "width" ? { aspectRatio: layout.aspect } : undefined}
    >
      <div className="absolute left-0 top-0" style={canvasStyle}>
        <TableFelt layout={layout} />
        <TableCentre
          layout={layout}
          round={view.round}
          trump={view.trumpSuit}
          advantageRow={view.advantageRow}
          activeIndex={(view.round - 1) % 4}
          status={status}
        />
        {view.players.map((p) => {
          const pos = positions[kOf(p.index)];
          if (!pos) return null;
          const play = plays.find((t) => t.seat === p.index) ?? null;
          const order = play ? plays.indexOf(play) + 1 : null;
          const handCount = p.index === view.me ? view.hand.length : p.handCount;
          return (
            <div key={p.index} data-seat={p.index} className="contents">
              <SeatPlate
                layout={layout}
                at={pos.plate}
                clan={p.clan}
                label={seatShortLabel(view, p.index, names)}
                handCount={handCount}
                tricksWon={p.tricksWon}
                isMe={p.index === view.me}
                isFirstPlayer={p.index === view.firstPlayer}
                isLeader={p.index === view.leader && !settling}
                isActive={p.index === activeSeat && !settling}
                isWinner={winner === p.index}
                reduce={reduce}
              />
              <CardSlot
                layout={layout}
                at={pos.slot}
                from={pos.plate}
                card={play?.card ?? null}
                cardKey={play ? `${view.round}:${play.card}` : null}
                order={order}
                trump={view.trumpSuit}
                playedBy={seatShortLabel(view, p.index, names)}
                isWinner={winner === p.index}
                sweeping={sweeping}
                winnerPlate={winnerPlate}
                reduce={reduce}
                onHoverStart={play ? () => preview.arm(play.card) : undefined}
                onHoverEnd={preview.cancel}
              />
            </div>
          );
        })}
      </div>
      <CardPreview onClose={preview.close}>
        {preview.preview ? (
          <SensoCard
            card={preview.preview}
            size="hand"
            trump={view.trumpSuit}
            ariaLabel={`${cardSpokenLabel(preview.preview)}, preview`}
          />
        ) : null}
      </CardPreview>
    </div>
  );
}
