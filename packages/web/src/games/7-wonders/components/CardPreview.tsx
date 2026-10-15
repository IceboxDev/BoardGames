import type { CardId } from "@boardgames/core/games/7-wonders/types";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CardArt from "./CardArt";

const GAP = 12;
/** The art is ~255 px wide natively; past ~1.3× it goes soft. */
const ART_W = 300;

/** Hovering the wrapped card shows the printed card large beside it. */
export default function CardPreview({
  cardId,
  children,
  className,
}: {
  cardId: CardId;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const W = ART_W;
    const H = ART_W * 1.5;
    const roomRight = window.innerWidth - r.right;
    const left = roomRight >= W + GAP * 2 ? r.right + GAP : Math.max(GAP, r.left - W - GAP);
    const top = Math.max(GAP, Math.min(r.top + r.height / 2 - H / 2, window.innerHeight - H - GAP));
    // A short delay so sweeping across a column doesn't flash every card.
    timer.current = setTimeout(() => setPos({ left, top }), 160);
  }, []);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPos(null);
  }, []);

  useEffect(() => hide, [hide]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover-only preview; the card's title carries the same text
    <div ref={ref} className={className} onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {pos &&
        createPortal(
          <div
            className="pointer-events-none fixed z-tooltip flex items-center gap-3"
            style={{ left: pos.left, top: pos.top }}
          >
            <div style={{ width: ART_W }} className="shadow-2xl">
              <CardArt cardId={cardId} variant="showcase" />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
