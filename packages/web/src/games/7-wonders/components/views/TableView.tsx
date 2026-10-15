import type { RevealedPlay } from "@boardgames/core/games/7-wonders/types";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../../../components/ui";
import { useMediaQuery, WIDE_BOARD_QUERY } from "../../../../hooks/useMediaQuery";
import { cn } from "../../../../lib/cn";
import { AGE_NUMERAL } from "../../card-utils";
import { ageBackArt, artUrl, WONDER_FOCUS, wonderBoardArt } from "../../logic/art";
import { borders, neighbourOf, passDirection, seatStatus, seatsFrom } from "../../logic/table";
import type { DraftInteraction } from "../../logic/useDraftInteraction";
import { AGE_TINT } from "../../logic/wonder-style";
import CardArt from "../CardArt";
import { ColourBar, StatusDot } from "../CityNavigator";
import SevenIcon, { CoinToken } from "../SevenIcon";
import WonderMedallion from "../WonderMedallion";

const TOKEN_W = 236;
const TOKEN_H = 140;

/**
 * Everyone around the table, as seated: you at the bottom, your left
 * neighbour to your left, on round to your right. Between neighbours, the
 * border as it would resolve this age; round the ring, the way the hands
 * pass; on each city, what it did in the last reveal.
 */
export default function TableView({
  ix,
  names,
  onOpen,
}: {
  ix: DraftInteraction;
  names: readonly string[];
  onOpen: (seat: number) => void;
}) {
  const { view, myIndex } = ix;
  const reduced = useReducedMotion();
  const wide = useMediaQuery(WIDE_BOARD_QUERY);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 640 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const n = view.playerCount;
  const order = seatsFrom(myIndex, n);
  const cx = size.w / 2;
  const cy = size.h / 2;
  const rx = Math.max(160, (size.w - TOKEN_W) / 2 - 8);
  const ry = Math.max(120, (size.h - TOKEN_H) / 2 - 4);
  const angleOf = (seat: number) => {
    const k = order.indexOf(seat);
    return Math.PI / 2 + (k * 2 * Math.PI) / n;
  };
  const at = (a: number) => ({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  const dir = passDirection(view.age);
  const tint = AGE_TINT[view.age];
  const map = artUrl("bg-map");
  const back = ageBackArt(view.age);
  const revealKey = view.lastRevealed.map((r) => `${r.playerIndex}:${r.cardId}`).join("|");

  if (!wide) {
    return (
      <div className="flex flex-col gap-3">
        <span
          className="flex items-center justify-between px-1 text-2xs font-semibold"
          style={{ color: tint.ink }}
        >
          <span>
            Age {AGE_NUMERAL[view.age]} · passing {dir === "left" ? "◂ left" : "right ▸"}
          </span>
          <span className="flex items-center gap-1 text-fg-muted">
            <SevenIcon name="discard" className="h-4 w-4" />
            {view.discardCount}
          </span>
        </span>
        {order.map((seat, k) => (
          <div key={seat} className="relative h-32">
            <CityToken
              inset
              ix={ix}
              seat={seat}
              names={names}
              onOpen={onOpen}
              revealKey={revealKey}
              delay={reduced ? 0 : k * 0.08}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={box}
      className="relative isolate min-h-0 flex-1 overflow-hidden rounded-card-xl shadow-xl ring-1 ring-black/60"
      style={{
        background: `radial-gradient(ellipse 60% 55% at 50% 50%, ${tint.from}26, transparent 70%), radial-gradient(ellipse at 50% 120%, #1b1410, #0b0a10 70%)`,
      }}
    >
      {/* The known world, as an old map under the table. */}
      {map && (
        <img
          src={map}
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
        />
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 48% 42% at 50% 50%, rgb(12 9 6 / 0.25), rgb(12 9 6 / 0.62) 70%, rgb(12 9 6 / 0.88) 100%)",
        }}
      />
      {/* The ring, flowing the way the hands pass. */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fill="none"
          stroke={tint.ink}
          strokeOpacity="0.18"
          strokeWidth="2"
        />
        <motion.ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fill="none"
          stroke={tint.ink}
          strokeOpacity="0.45"
          strokeWidth="2"
          strokeDasharray="2 22"
          strokeLinecap="round"
          animate={reduced ? undefined : { strokeDashoffset: dir === "left" ? [0, -48] : [0, 48] }}
          transition={
            reduced
              ? undefined
              : { duration: 1.6, ease: "linear", repeat: Number.POSITIVE_INFINITY }
          }
        />
      </svg>

      {/* The middle: this age's deck and the discard pile. */}
      <div
        className="absolute flex items-end gap-6"
        style={{ left: cx, top: cy, transform: "translate(-50%, -50%)" }}
      >
        <div className="flex flex-col items-center gap-2">
          {back ? (
            <motion.img
              key={view.age}
              src={back}
              alt={`Age ${AGE_NUMERAL[view.age]}`}
              draggable={false}
              initial={reduced ? false : { rotateY: 90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="w-24 -rotate-2 select-none rounded-card-md shadow-[0_14px_30px_rgb(0_0_0/0.7)] ring-1 ring-black/60"
              style={{ aspectRatio: "2 / 3" }}
            />
          ) : (
            <span
              className="font-fantasy text-6xl font-bold leading-none text-fg-strong"
              style={{ textShadow: `0 0 24px ${tint.from}` }}
            >
              {AGE_NUMERAL[view.age]}
            </span>
          )}
          <span
            className="rounded-full bg-surface-950/80 px-2.5 py-0.5 text-2xs font-semibold shadow ring-1 ring-line"
            style={{ color: tint.ink }}
          >
            Age {AGE_NUMERAL[view.age]} · passing {dir === "left" ? "◂ left" : "right ▸"}
          </span>
        </div>
        <div className="flex flex-col items-center gap-2" title="The discard pile">
          <span className="relative block w-16" style={{ aspectRatio: "2 / 3" }}>
            {back && view.discardCount > 0 ? (
              [0, 1, 2].slice(0, Math.min(3, view.discardCount)).map((k) => (
                <img
                  key={k}
                  src={back}
                  alt=""
                  aria-hidden
                  draggable={false}
                  className="absolute inset-0 h-full w-full select-none rounded-ui-md shadow-lg ring-1 ring-black/60"
                  style={{
                    transform: `rotate(${[-9, 4, 13][k]}deg) translate(${k * 3}px, ${-k * 2}px)`,
                    filter: "brightness(0.8) saturate(0.8)",
                  }}
                />
              ))
            ) : (
              <span className="absolute inset-0 rounded-ui-md border border-dashed border-line-strong" />
            )}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-surface-950/80 px-2 py-0.5 text-2xs tabular-nums text-fg-secondary shadow ring-1 ring-line">
            <SevenIcon name="discard" className="h-4 w-4" />
            {view.discardCount}
          </span>
        </div>
      </div>

      {/* The borders, between neighbours. */}
      {n > 2 &&
        borders(view.players).map((b) => {
          // b is a's left neighbour: the next seat round from a.
          const k = order.indexOf(b.a);
          const mid = at(Math.PI / 2 + ((k + 0.5) * 2 * Math.PI) / n);
          const pa = at(angleOf(b.a));
          const pb = at(angleOf(b.b));
          const aFirst = pa.x <= pb.x;
          const left = aFirst ? { seat: b.a, s: b.aShields } : { seat: b.b, s: b.bShields };
          const right = aFirst ? { seat: b.b, s: b.bShields } : { seat: b.a, s: b.aShields };
          return (
            <div
              key={`${b.a}-${b.b}`}
              className="absolute z-lift flex items-center gap-1.5 rounded-full bg-surface-950/85 px-2 py-0.5 text-xs font-bold tabular-nums shadow-lg ring-1 ring-line-strong backdrop-blur"
              style={{ left: mid.x, top: mid.y, transform: "translate(-50%, -50%)" }}
              title={`${names[left.seat]} ${left.s} shields — ${names[right.seat]} ${right.s} shields`}
            >
              <span className={b.winner === left.seat ? "text-amber-200" : "text-fg-muted"}>
                {left.s}
              </span>
              <SevenIcon name="shield" className="h-5 w-5" />
              <span className={b.winner === right.seat ? "text-amber-200" : "text-fg-muted"}>
                {right.s}
              </span>
            </div>
          );
        })}

      {/* The cities. */}
      {order.map((seat, k) => {
        const pos = at(angleOf(seat));
        return (
          <div
            key={seat}
            className="absolute z-raised"
            style={{
              left: pos.x - TOKEN_W / 2,
              top: pos.y - TOKEN_H / 2,
              width: TOKEN_W,
              height: TOKEN_H,
            }}
          >
            <CityToken
              ix={ix}
              seat={seat}
              names={names}
              onOpen={onOpen}
              revealKey={revealKey}
              delay={reduced ? 0 : k * 0.08}
            />
          </div>
        );
      })}
    </div>
  );
}

/** One city at the table: its medallion, its numbers, its last move. */
function CityToken({
  ix,
  seat,
  names,
  onOpen,
  revealKey,
  delay,
  inset = false,
}: {
  ix: DraftInteraction;
  seat: number;
  names: readonly string[];
  onOpen: (seat: number) => void;
  revealKey: string;
  delay: number;
  inset?: boolean;
}) {
  const { view, myIndex } = ix;
  const p = view.players[seat];
  const mine = seat === myIndex;
  const side = neighbourOf(myIndex, seat, view.playerCount);
  const play = view.lastRevealed.find((r) => r.playerIndex === seat);
  const art = wonderBoardArt(p.wonderId, p.side);
  return (
    <>
      <Button
        variant="plain"
        bleed
        onClick={() => onOpen(seat)}
        aria-label={`Open ${names[seat]}'s city`}
        className="h-full"
      >
        <div
          className={cn(
            "relative isolate flex h-full w-full flex-col gap-1.5 overflow-hidden rounded-card-xl bg-surface-900/95 p-2.5 text-left shadow-[0_10px_24px_rgb(0_0_0/0.6)] ring-1 transition-transform hover:-translate-y-0.5",
            mine ? "ring-2 ring-amber-300/80" : "ring-black/60",
          )}
        >
          {art && (
            <img
              src={art}
              alt=""
              aria-hidden
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
              style={{ objectPosition: `${WONDER_FOCUS[p.wonderId].x * 100}% 40%` }}
            />
          )}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgb(14 11 9 / 0.35) 0%, rgb(14 11 9 / 0.72) 45%, rgb(14 11 9 / 0.94) 75%)",
            }}
          />
          <div className="relative flex items-center gap-2">
            <WonderMedallion
              wonderId={p.wonderId}
              side={p.side}
              stagesBuilt={p.stagesBuilt}
              className="h-12 w-12"
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span
                className="flex items-center gap-1.5 text-sm font-semibold text-fg-strong"
                style={{ textShadow: "0 1px 4px rgb(0 0 0 / 0.9)" }}
              >
                <span className="truncate">{mine ? "You" : names[seat]}</span>
                <StatusDot status={seatStatus(view, seat)} />
              </span>
              <span className="truncate text-3xs uppercase tracking-label text-fg-secondary">
                {side === "left" ? "◂ Left · " : side === "right" ? "Right ▸ · " : ""}
                {p.tableau.length} cards
              </span>
            </div>
          </div>
          <div className="relative mt-auto flex items-center gap-3 text-xs tabular-nums text-fg-secondary">
            <span className="flex items-center gap-1 text-base font-bold text-fg-strong">
              <SevenIcon name="laurel" className="h-5 w-5" />
              {p.score.total}
            </span>
            <span className="flex items-center gap-1">
              <CoinToken className="h-4 w-4" />
              {p.coins}
            </span>
            <span className="flex items-center gap-1">
              <SevenIcon name="shield" className="h-4 w-4" />
              {p.shields}
            </span>
            <span className="flex items-center gap-1">
              <SevenIcon name="gear" className="h-4 w-4" />
              {p.score.science}
            </span>
          </div>
          <ColourBar tableau={p.tableau} className="relative" />
        </div>
      </Button>
      {play && (
        <LastPlay
          key={`${revealKey}-${seat}`}
          play={play}
          delay={delay}
          inset={inset}
          back={ageBackArt(view.age)}
        />
      )}
    </>
  );
}

/** What a city did in the last reveal, flipped in on its corner. */
function LastPlay({
  play,
  delay,
  inset,
  back,
}: {
  play: RevealedPlay;
  /** This age's card back, for a card that went face down. */
  back?: string;
  delay: number;
  /** Phones: keep it inside the token, which spans the screen. */
  inset: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={cn(
        "pointer-events-none absolute z-raised-2 w-12",
        inset ? "right-3 top-2" : "-right-3 -top-4",
      )}
      initial={reduced ? false : { rotateY: 90, opacity: 0 }}
      animate={{ rotateY: 0, opacity: 1 }}
      transition={{ delay, duration: 0.35 }}
      title={
        play.action === "play-card"
          ? "Built last turn"
          : play.action === "build-wonder"
            ? "Built a wonder stage last turn"
            : "Discarded last turn"
      }
    >
      {play.action === "play-card" ? (
        <div className="rotate-6">
          <CardArt cardId={play.cardId} variant="mini" />
        </div>
      ) : (
        <div className="relative w-full rotate-6">
          {back ? (
            <img
              src={back}
              alt=""
              aria-hidden
              draggable={false}
              className="w-full select-none rounded-ui-md shadow-lg ring-1 ring-black/60"
              style={{ aspectRatio: "2 / 3" }}
            />
          ) : (
            <div className="aspect-card w-full rounded-card-md bg-surface-800 shadow-lg ring-1 ring-black/50" />
          )}
          <span className="absolute -bottom-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-surface-950/90 shadow ring-1 ring-amber-300/60">
            <SevenIcon
              name={play.action === "build-wonder" ? "wonder" : "discard"}
              className="h-5 w-5"
            />
          </span>
        </div>
      )}
    </motion.div>
  );
}
