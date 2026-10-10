import { motion, useReducedMotion } from "framer-motion";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { Button } from "./Button";

// A first-use hint: a pulsing ring around one real control and a small
// bubble beside it saying what it does. Mounted = shown. Built for phones:
// the bubble sits below the target, or above when there's no room, clamped
// to the screen with a 16px gutter, and follows the target as the page
// scrolls or reflows. It never covers its own target, and the target stays
// usable — tapping it (or anywhere else) dismisses the hint too.
//
// Sits on the `z-tooltip` layer, so a hint can point inside an open modal.
// It deliberately does NOT take Escape: Escape belongs to the dialog under
// it, and a hint must never make Escape close the wrong thing.

type Target = string | RefObject<HTMLElement | null>;

export type CoachmarkProps = {
  /** A CSS selector (e.g. `[data-tour="calendar-start"]`) or a ref to the control. */
  target: Target;
  title?: ReactNode;
  children: ReactNode;
  onDismiss: () => void;
  dismissLabel?: string;
};

const GUTTER = 16;
const GAP = 12;
const RING_PAD = 6;

type Rect = { top: number; left: number; width: number; height: number };

function resolve(target: Target): HTMLElement | null {
  if (typeof target === "string") {
    return typeof document === "undefined" ? null : document.querySelector<HTMLElement>(target);
  }
  return target.current;
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  return (
    a === b ||
    (!!a &&
      !!b &&
      a.top === b.top &&
      a.left === b.left &&
      a.width === b.width &&
      a.height === b.height)
  );
}

/** The target's box on screen, followed every frame (scroll, reflow, animation). */
function useTargetRect(target: Target): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  const last = useRef<Rect | null>(null);
  const scrolled = useRef(false);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const el = resolve(target);
      let next: Rect | null = null;
      if (el) {
        if (!scrolled.current) {
          scrolled.current = true;
          el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
        }
        const r = el.getBoundingClientRect();
        const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
        next = visible
          ? {
              top: Math.round(r.top),
              left: Math.round(r.left),
              width: Math.round(r.width),
              height: Math.round(r.height),
            }
          : null;
      }
      if (!sameRect(next, last.current)) {
        last.current = next;
        setRect(next);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return rect;
}

/** Where the bubble goes: below the target, else above; clamped to the screen. */
export function placeBubble(
  target: Rect,
  bubble: { width: number; height: number },
  viewport: { width: number; height: number },
): { top: number; left: number; side: "below" | "above"; arrowLeft: number } {
  const below = target.top + target.height + GAP;
  const fitsBelow = below + bubble.height <= viewport.height - GUTTER;
  const above = target.top - GAP - bubble.height;
  const side = fitsBelow || above < GUTTER ? "below" : "above";
  const top = side === "below" ? below : above;
  const centre = target.left + target.width / 2;
  const maxLeft = Math.max(GUTTER, viewport.width - GUTTER - bubble.width);
  const left = Math.min(maxLeft, Math.max(GUTTER, centre - bubble.width / 2));
  const arrowLeft = Math.min(bubble.width - 20, Math.max(20, centre - left));
  return { top, left, side, arrowLeft };
}

export function Coachmark({
  target,
  title,
  children,
  onDismiss,
  dismissLabel = "Got it",
}: CoachmarkProps) {
  const reduced = useReducedMotion();
  const rect = useTargetRect(target);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 280, height: 120 });

  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) =>
        s.width === r.width && s.height === r.height ? s : { width: r.width, height: r.height },
      );
    };
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [rect !== null]);

  // A tap anywhere but the bubble dismisses — including on the target, which
  // still does its own job (the hint only explains it).
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (bubbleRef.current?.contains(e.target as Node)) return;
      dismissRef.current();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, []);

  if (!rect || typeof document === "undefined") return null;
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const place = placeBubble(rect, size, viewport);

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-tooltip">
      {/* The ring: around the control, never over it (pointer-events off). */}
      <span
        aria-hidden="true"
        className="absolute rounded-ui-lg ring-2 ring-accent-400 ring-offset-2 ring-offset-surface-950"
        style={{
          top: rect.top - RING_PAD,
          left: rect.left - RING_PAD,
          width: rect.width + RING_PAD * 2,
          height: rect.height + RING_PAD * 2,
        }}
      >
        {!reduced && (
          <span className="absolute inset-0 animate-ping rounded-ui-lg ring-2 ring-accent-400/60" />
        )}
      </span>

      <motion.div
        ref={bubbleRef}
        role="dialog"
        aria-live="polite"
        aria-label={typeof title === "string" ? title : "Tip"}
        initial={reduced ? false : { opacity: 0, y: place.side === "below" ? -6 : 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="pointer-events-auto absolute flex w-max max-w-[min(20rem,calc(100vw-2rem))] flex-col gap-2 rounded-card-lg border border-accent-400/50 bg-surface-900 p-3 shadow-xl"
        style={{ top: place.top, left: place.left }}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute h-3 w-3 rotate-45 border-accent-400/50 bg-surface-900",
            place.side === "below" ? "-top-1.5 border-l border-t" : "-bottom-1.5 border-b border-r",
          )}
          style={{ left: place.arrowLeft - 6 }}
        />
        {title && <p className="text-sm font-semibold text-fg-strong">{title}</p>}
        <div className="text-sm leading-relaxed text-fg-secondary">{children}</div>
        <Button variant="primary" size="sm" className="self-end" onClick={onDismiss}>
          {dismissLabel}
        </Button>
      </motion.div>
    </div>,
    document.body,
  );
}
