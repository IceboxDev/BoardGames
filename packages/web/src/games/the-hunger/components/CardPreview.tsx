import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import HungerCard from "./HungerCard";

const GAP = 12;

/** The preview's size: as tall as the screen comfortably allows, at the card's 2:3. */
function previewSize(): { w: number; h: number } {
  const h = Math.min(window.innerHeight * 0.72, 640);
  return { w: Math.round((h * 2) / 3), h: Math.round(h) };
}

/**
 * Hovering the wrapped card shows it large beside it — the showcase face,
 * every keyword spelled out. It opens on the side with room
 * (left of the right-hand column, usually) and stays on screen.
 */
export default function CardPreview({
  card,
  children,
  className,
}: {
  card: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; w: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const { w: W, h: H } = previewSize();
    const roomRight = window.innerWidth - r.right;
    const left = roomRight >= W + GAP * 2 ? r.right + GAP : Math.max(GAP, r.left - W - GAP);
    const top = Math.max(GAP, Math.min(r.top + r.height / 2 - H / 2, window.innerHeight - H - GAP));
    // A short delay so sweeping the mouse across a pile doesn't flash cards.
    timer.current = setTimeout(() => setPos({ left, top, w: W }), 150);
  }, []);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPos(null);
  }, []);

  useEffect(() => hide, [hide]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover-only preview; the row's own text carries the information
    <div ref={ref} className={className} onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {pos &&
        createPortal(
          <div
            className="pointer-events-none fixed z-tooltip shadow-2xl"
            style={{ left: pos.left, top: pos.top, width: pos.w }}
          >
            <HungerCard card={card} variant="showcase" />
          </div>,
          document.body,
        )}
    </div>
  );
}
