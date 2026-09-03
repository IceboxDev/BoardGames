import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { groupForPresentation, type PresentationUnit } from "../../games/families";
import type { GameDefinition } from "../../games/types";
import { fitsLabel, fitsRange, isBestForHeadcount } from "../../lib/bgg-format";
import type { ReactionAggregate } from "../../lib/calendar-games";
import {
  ASPECT,
  BestForHeadcountBadge,
  CAROUSEL_TRANSITION_CSS,
  CAROUSEL_WINDOW,
  CarouselBody,
  CarouselCardChrome,
  CarouselThumb,
  carouselPose,
  FitsBadge,
  FLOOR_CARD_W,
  MAX_CARD_W,
  MIN_CARD_W,
  NARROW_ASPECT,
  NARROW_CONTAINER_W,
  NewBadge,
  REF_CARD_H,
  REF_CARD_W,
  VariantStrip,
  VERTICAL_BREATHING,
  YearBadge,
} from "../game";
import { ChevronLeftIcon, ChevronRightIcon } from "../icons";
import FamilyCarouselCard from "./FamilyCarouselCard";
import GameReactions from "./GameReactions";

type Props = {
  games: GameDefinition[];
  /** Confirmed-attendee count (lower bound of the player-count range). */
  minPlayers: number;
  /** Confirmed + tentative count (upper bound of the player-count range). */
  maxPlayers: number;
  /** Date key — used as the scope for reactions. Empty string = no reactions UI. */
  date: string;
  reactions: Record<string, ReactionAggregate>;
  /**
   * Replaces the default reactions widget in the thumb's bottom-center
   * overlay slot (the purchase-vote carousel drops its Vote chip here).
   * When set, `date`/`reactions` are ignored for the overlay. Note that
   * family members collapse into one card — the overlay receives whichever
   * member is active.
   */
  renderThumbOverlay?: (game: GameDefinition, isCenter: boolean, compact: boolean) => ReactNode;
  /**
   * Paint the freshly-added treatment (green ring + NEW badge). On by
   * default; the purchase-vote carousel turns it off — every candidate is
   * equally "on the ballot" and the highlight would read as an endorsement.
   */
  highlightNew?: boolean;
};

// Swipe thresholds — distance OR flick velocity advances the carousel.
const SWIPE_DISTANCE_PX = 60;
const SWIPE_VELOCITY_PX_S = 400;
// Finger-follow resistance while dragging the stack sideways.
const DRAG_FOLLOW = 0.55;

export default function GameCarousel3D({
  games,
  minPlayers,
  maxPlayers,
  date,
  reactions,
  renderThumbOverlay,
  highlightNew = true,
}: Props) {
  // Project games into presentation units — families collapse to one
  // card, singletons stay as-is. The carousel navigates over UNITS, not
  // games.
  const units = useMemo<PresentationUnit[]>(() => groupForPresentation(games), [games]);
  const count = units.length;

  const [center, setCenter] = useState(0);
  // True for the render(s) of an end-to-end jump: transitions are suppressed
  // so the strip snaps instead of flying every card across the carousel.
  const [instant, setInstant] = useState(false);
  // Per-family active member, persisted across center changes so the
  // user's last variant pick survives swiping away and back. Until the user
  // picks, the active member is the unit's ANCHOR — the sibling that won the
  // caller's sort and pulled the family to this position. Defaulting to the
  // family's canonical instead would open Codenames on a 2-player night
  // showing "Codenames · fits 2" while Codenames Duet — the "best at 2" that
  // put the card up front — sat hidden behind a variant chip.
  const [activeByFamily, setActiveByFamily] = useState<Map<string, string>>(() => new Map());
  const rootRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Stepping past either end JUMPS to the other end (an instant snap, not a
  // scroll through the whole strip). Offsets stay linear (`i - center`), so
  // the first card never shows anything to its left and the last nothing to
  // its right — reaching an edge stays visually unambiguous.
  const goPrev = useCallback(() => {
    if (center === 0) {
      setInstant(true);
      setCenter(count - 1);
    } else {
      setCenter(center - 1);
    }
  }, [center, count]);

  const goNext = useCallback(() => {
    if (center === count - 1) {
      setInstant(true);
      setCenter(0);
    } else {
      setCenter(center + 1);
    }
  }, [center, count]);

  // Re-enable transitions one frame after the jump landed — double rAF so
  // the snapped styles are committed before the transition property returns.
  useEffect(() => {
    if (!instant) return;
    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => setInstant(false));
    });
    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
    };
  }, [instant]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goPrev, goNext]);

  // ── Pointer swipe ─────────────────────────────────────────────────
  //
  // Hand-rolled so dragging costs ONE style write per pointer event (the
  // stack container's translateX via ref) and zero React renders — the
  // previous framer-motion drag+springs re-styled every card from JS each
  // frame, which is what chopped on phones. Release snaps the stack back
  // via the same CSS transition the cards use, so the two motions read as
  // one spring.
  const dragRef = useRef({
    active: false,
    moved: false,
    pointerId: -1,
    startX: 0,
    lastX: 0,
    lastT: 0,
    vx: 0,
  });

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const d = dragRef.current;
    d.active = true;
    d.moved = false;
    d.pointerId = e.pointerId;
    d.startX = e.clientX;
    d.lastX = e.clientX;
    d.lastT = performance.now();
    d.vx = 0;
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d.active || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) > 8) {
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const now = performance.now();
    const dt = now - d.lastT;
    if (dt > 0) d.vx = 0.8 * d.vx + 0.2 * (((e.clientX - d.lastX) / dt) * 1000);
    d.lastX = e.clientX;
    d.lastT = now;
    const el = stackRef.current;
    if (el && d.moved) {
      el.style.transition = "none";
      el.style.transform = `translateX(${dx * DRAG_FOLLOW}px)`;
    }
  }

  function settleStack() {
    const el = stackRef.current;
    if (!el) return;
    el.style.transition = CAROUSEL_TRANSITION_CSS;
    el.style.transform = "translateX(0px)";
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d.active || e.pointerId !== d.pointerId) return;
    d.active = false;
    settleStack();
    if (!d.moved) return;
    const dx = e.clientX - d.startX;
    if (dx < -SWIPE_DISTANCE_PX || d.vx < -SWIPE_VELOCITY_PX_S) goNext();
    else if (dx > SWIPE_DISTANCE_PX || d.vx > SWIPE_VELOCITY_PX_S) goPrev();
  }

  function onPointerCancel() {
    dragRef.current.active = false;
    settleStack();
  }

  // A real drag must not double as a click on whichever card it ends over.
  function onClickCapture(e: React.MouseEvent<HTMLDivElement>) {
    if (dragRef.current.moved) {
      dragRef.current.moved = false;
      e.preventDefault();
      e.stopPropagation();
    }
  }

  if (count === 0) return null;

  function setActiveForFamily(familyId: string, slug: string) {
    setActiveByFamily((prev) => {
      const next = new Map(prev);
      next.set(familyId, slug);
      return next;
    });
  }

  // Derive card dimensions from measured container size with clamps. On
  // phones the card is width-bounded; on desktop the MAX cap or
  // height/ASPECT bounds it (so the 0.92 factor only matters when width
  // is the binding constraint — i.e. portrait phones — where we want the
  // card as large as legibility allows and accept that the rotated side
  // cards mostly clip behind overflow-hidden).
  //
  // Height budget subtracts VERTICAL_BREATHING so the card never sits
  // flush against the masked wrapper's hard-clip edges. Without it,
  // intermediate height-bound viewports (1366×768, 1440×900, laptops
  // with browser chrome taking a chunk of vertical space) crop the amber
  // "best at" shadow at the bottom and pull the fade ramp into the
  // card's own top/bottom edges.
  const measured = size.w > 0 && size.h > 0;
  const narrow = measured && size.w < NARROW_CONTAINER_W;
  const heightBudget = Math.max(0, size.h - VERTICAL_BREATHING);
  // Width picks the card size up to MIN_CARD_W…MAX_CARD_W; the height budget
  // is a HARD cap on top. The old formula applied MIN_CARD_W after the height
  // cap, which force-inflated the card past a short container (360×644-class
  // phones) and clipped its top and bottom against the masked wrapper.
  const widthDriven = Math.max(MIN_CARD_W, Math.min(MAX_CARD_W, size.w * 0.92));
  let aspect = ASPECT;
  let cardW = measured
    ? Math.max(FLOOR_CARD_W, Math.min(widthDriven, heightBudget / aspect))
    : REF_CARD_W;
  // Below the design minimum the full body (description + weight bar) no
  // longer fits its height share — drop to the compact layout instead of
  // letting the body overflow the card's clip edge.
  let compact = cardW < MIN_CARD_W;
  // A narrow container that is ALSO height-bound (the purchase-vote modal
  // on phones) starves the tower aspect: re-derive at the shorter
  // NARROW_ASPECT — same height, meaningfully wider — and force the
  // compact body, whose 2-line title beats the full body's one-line
  // truncate at these widths. Width-bound phone carousels (cardW ===
  // widthDriven, i.e. the RSVP picker) never enter this branch.
  if (narrow && cardW < widthDriven) {
    aspect = NARROW_ASPECT;
    cardW = Math.max(FLOOR_CARD_W, Math.min(widthDriven, heightBudget / aspect));
    compact = true;
  }
  const cardH = cardW * aspect;
  const thumbH = cardH * (270 / REF_CARD_H);
  const bodyH = cardH * (290 / REF_CARD_H);

  // 3D constants scale with cardW so the spread/depth stay visually
  // coherent.
  const spreadMax = cardW * (520 / REF_CARD_W);
  const zMax = cardW * (380 / REF_CARD_W);
  const perspective = cardW * (1600 / REF_CARD_W);

  // Shared chrome for the two edge nav buttons; only the side (left/right) and
  // each button's handler / aria-label / icon differ. No backdrop-blur:
  // backdrop-filter re-samples the animating cards behind the button every
  // frame, which is disproportionately expensive on phones.
  const navBtnCls =
    "absolute top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-surface-900/90 text-white transition hover:bg-surface-800 disabled:cursor-not-allowed disabled:opacity-30 sm:h-12 sm:w-12";

  // Render only the units within the cull window. Everything further out is
  // invisible behind the edge fade anyway, and every mounted card is a
  // composited 3D layer.
  const visible = units
    .map((unit, i) => ({ unit, i, offset: i - center }))
    .filter(({ offset }) => Math.abs(offset) <= CAROUSEL_WINDOW);

  return (
    <div
      ref={rootRef}
      className={`relative flex h-full w-full items-center justify-center ${
        instant ? "carousel-no-anim" : ""
      }`}
      style={{ perspective: `${perspective}px`, opacity: measured ? 1 : 0 }}
    >
      <button
        type="button"
        onClick={goPrev}
        disabled={count < 2}
        aria-label="Previous game"
        className={`${navBtnCls} left-2 sm:left-4`}
      >
        <ChevronLeftIcon />
      </button>

      {/* Cards are clipped by their own container with a soft-edge mask
          composed of two linear gradients combined via `mask-composite:
          intersect` (WebKit `source-in`).
          - Horizontal ramp is up to 56px — side cards bunch at high
            rotation angles and the wide ramp dissolves them gracefully —
            but never wider than the centered card's actual side margin.
            On phones the card spans ~92% of the container, so a fixed
            56px ramp used to fade the center card's own left and right
            edges; clamping to the real margin keeps the card fully
            opaque at every width.
          - Vertical ramp is shorter (≤20px, same margin clamp). It exists
            only to soften the amber "best at" glow that extends a few px
            past the top/bottom edges of the centered card; the
            VERTICAL_BREATHING subtraction guarantees ≥16px of true
            margin, so the ramp never touches the card itself.
          Chevrons and the lifted variant chip strips stay outside this
          masked wrapper so they render at full opacity. */}
      <div
        className="relative flex h-full w-full items-center justify-center overflow-hidden"
        style={(() => {
          const sideRamp = Math.round(Math.min(56, Math.max(0, (size.w - cardW) / 2)));
          const vertRamp = Math.round(Math.min(20, Math.max(0, (size.h - cardH) / 2)));
          const mask = `linear-gradient(to right, transparent 0, black ${sideRamp}px, black calc(100% - ${sideRamp}px), transparent 100%), linear-gradient(to bottom, transparent 0, black ${vertRamp}px, black calc(100% - ${vertRamp}px), transparent 100%)`;
          return {
            WebkitMaskImage: mask,
            WebkitMaskComposite: "source-in",
            maskImage: mask,
            maskComposite: "intersect",
            touchAction: "pan-y",
          };
        })()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={onClickCapture}
      >
        <div
          ref={stackRef}
          className="relative mx-auto"
          style={{ width: cardW, height: cardH, transformStyle: "preserve-3d" }}
        >
          {visible.map(({ unit, i, offset }) => {
            if (unit.kind === "single") {
              return (
                <SingleCarouselCard
                  key={unit.game.slug}
                  game={unit.game}
                  offset={offset}
                  minPlayers={minPlayers}
                  maxPlayers={maxPlayers}
                  date={date}
                  aggregate={reactions[unit.game.slug]}
                  renderThumbOverlay={renderThumbOverlay}
                  highlightNew={highlightNew}
                  onClick={() => setCenter(i)}
                  cardW={cardW}
                  cardH={cardH}
                  thumbHeight={thumbH}
                  bodyHeight={bodyH}
                  spreadMax={spreadMax}
                  zMax={zMax}
                  compact={compact}
                />
              );
            }
            const activeSlug = activeByFamily.get(unit.family.id) ?? unit.anchor.slug;
            return (
              <FamilyCarouselCard
                key={`family:${unit.family.id}`}
                family={unit.family}
                visibleMembers={unit.visibleMembers}
                activeSlug={activeSlug}
                offset={offset}
                minPlayers={minPlayers}
                maxPlayers={maxPlayers}
                date={date}
                reactions={reactions}
                renderThumbOverlay={renderThumbOverlay}
                highlightNew={highlightNew}
                onClick={() => setCenter(i)}
                cardW={cardW}
                cardH={cardH}
                thumbHeight={thumbH}
                bodyHeight={bodyH}
                spreadMax={spreadMax}
                zMax={zMax}
                compact={compact}
              />
            );
          })}
        </div>
      </div>

      {/* Lifted variant chip strips — one shadow div per visible family
          unit, rendered OUTSIDE the masked wrapper above so chips render
          at full opacity even when their card sits flush against the
          carousel fade. Each shadow div is a card-sized container at the
          card's static position and carries the *exact same* transform
          and transition as its actual card, so the chips visually attach
          to the card during navigation. Only the centered family's chips
          are visible (others fade to opacity 0); chips are interactive
          only when isCenter. */}
      {measured &&
        visible.map(({ unit, offset }) => {
          if (unit.kind !== "family") return null;
          const isCenter = offset === 0;
          const activeSlug = activeByFamily.get(unit.family.id) ?? unit.anchor.slug;
          const pose = carouselPose({ offset, spreadMax, zMax });
          return (
            <div
              key={`chips:${unit.family.id}`}
              className="carousel-pose pointer-events-none absolute z-30 origin-center"
              style={
                {
                  width: cardW,
                  height: cardH,
                  left: "50%",
                  top: "50%",
                  marginLeft: -cardW / 2,
                  marginTop: -cardH / 2,
                  transformStyle: "preserve-3d",
                  transform: pose.transform,
                  "--pose-opacity": isCenter ? pose.opacity : 0,
                } as React.CSSProperties
              }
            >
              <div
                className={`absolute ${isCenter ? "pointer-events-auto" : "pointer-events-none"}`}
                style={{ top: thumbH / 2, left: -14 }}
              >
                <div className="-translate-y-1/2">
                  <VariantStrip
                    members={unit.visibleMembers}
                    activeSlug={activeSlug}
                    interactive={isCenter}
                    onPick={(slug) => setActiveForFamily(unit.family.id, slug)}
                    fitWindow={{ lo: minPlayers, hi: maxPlayers }}
                  />
                </div>
              </div>
            </div>
          );
        })}

      <button
        type="button"
        onClick={goNext}
        disabled={count < 2}
        aria-label="Next game"
        className={`${navBtnCls} right-2 sm:right-4`}
      >
        <ChevronRightIcon />
      </button>
    </div>
  );
}

// ── Single-game card ────────────────────────────────────────────────────

type SingleCardProps = {
  game: GameDefinition;
  offset: number;
  minPlayers: number;
  maxPlayers: number;
  date: string;
  aggregate: ReactionAggregate | undefined;
  renderThumbOverlay?: (game: GameDefinition, isCenter: boolean, compact: boolean) => ReactNode;
  highlightNew: boolean;
  onClick: () => void;
  cardW: number;
  cardH: number;
  thumbHeight: number;
  bodyHeight: number;
  spreadMax: number;
  zMax: number;
  compact: boolean;
};

function SingleCarouselCard({
  game,
  offset,
  minPlayers,
  maxPlayers,
  date,
  aggregate,
  renderThumbOverlay,
  highlightNew,
  onClick,
  cardW,
  cardH,
  thumbHeight,
  bodyHeight,
  spreadMax,
  zMax,
  compact,
}: SingleCardProps) {
  const isCenter = offset === 0;
  const fits = fitsRange(game, minPlayers, maxPlayers);
  const isBest = isBestForHeadcount(game, minPlayers);
  // Freshly-added games take precedence over the headcount treatment.
  const isNew = highlightNew && game.isNew === true;

  return (
    <CarouselCardChrome
      cardW={cardW}
      cardH={cardH}
      offset={offset}
      isCenter={isCenter}
      accentHex={game.accentHex}
      isNew={isNew}
      isBestForHeadcount={isBest}
      ariaLabel={isCenter ? `${game.title}, current selection` : `Show ${game.title}`}
      onClick={onClick}
      spreadMax={spreadMax}
      zMax={zMax}
    >
      <CarouselThumb
        src={game.thumbnail}
        thumbHeight={thumbHeight}
        accentHex={game.accentHex}
        isCenter={isCenter}
        badgeTopRight={
          game.bgg.yearPublished ? <YearBadge year={game.bgg.yearPublished} /> : undefined
        }
        badgeTopLeft={
          isNew ? (
            <NewBadge />
          ) : isBest ? (
            <BestForHeadcountBadge count={minPlayers} />
          ) : fits && (minPlayers > 0 || maxPlayers > 0) ? (
            <FitsBadge label={fitsLabel(minPlayers, maxPlayers)} />
          ) : undefined
        }
        overlay={
          renderThumbOverlay ? (
            renderThumbOverlay(game, isCenter, compact)
          ) : date ? (
            <GameReactions
              date={date}
              slug={game.slug}
              accentHex={game.accentHex}
              aggregate={aggregate ?? { hype: 0, teach: 0, learn: 0, viewer: [] }}
              size={compact ? "sm" : "md"}
              disabled={!isCenter}
              hideCount
            />
          ) : undefined
        }
      />
      <CarouselBody
        bodyHeight={bodyHeight}
        cardW={cardW}
        accentHex={game.accentHex}
        title={game.title}
        bgg={game.bgg}
        bestForHeadcount={isBest ? minPlayers : null}
        descriptions={game.descriptions}
        compact={compact}
      />
    </CarouselCardChrome>
  );
}
