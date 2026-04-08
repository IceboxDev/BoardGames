import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface CardTagProps {
  /** Emoji or icon to show inline. */
  emoji?: string;
  /** Text label for the card. */
  label: string;
  /** Image URL for the tooltip preview. */
  imageUrl?: string;
  /** Optional custom tooltip content (overrides imageUrl). */
  tooltipContent?: ReactNode;
}

interface TooltipPos {
  left: number;
  top: number;
}

const TOOLTIP_W = 150;
const TOOLTIP_H = 260;

export default function CardTag({ emoji, label, imageUrl, tooltipContent }: CardTagProps) {
  const [pos, setPos] = useState<TooltipPos | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const handleEnter = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();

    let top: number;
    if (rect.top > TOOLTIP_H + 8) {
      top = rect.top - TOOLTIP_H - 4;
    } else {
      top = rect.bottom + 4;
    }

    let left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - TOOLTIP_W - 8));

    setPos({ left, top });
  }, []);

  const handleLeave = useCallback(() => setPos(null), []);

  const hasTooltip = imageUrl || tooltipContent;
  const isSvg = imageUrl?.endsWith(".svg");

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: tooltip hover trigger */}
      <span
        ref={triggerRef}
        className="inline-flex items-center gap-0.5 rounded bg-white/10 px-1 py-0.5 text-[11px] font-medium text-white/90 transition hover:bg-white/20"
        style={{ cursor: hasTooltip ? "help" : undefined }}
        onMouseEnter={hasTooltip ? handleEnter : undefined}
        onMouseLeave={hasTooltip ? handleLeave : undefined}
      >
        {emoji && <span>{emoji}</span>}
        {label}
      </span>
      {pos &&
        hasTooltip &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999]"
            style={{ left: pos.left, top: pos.top }}
          >
            <div className="flex w-[150px] flex-col items-center gap-1 rounded-xl bg-gray-900 p-1.5 shadow-2xl ring-1 ring-white/20">
              {tooltipContent ?? (
                <img
                  src={imageUrl}
                  alt={label}
                  className={`w-full rounded-lg ${isSvg ? "h-[220px] bg-white object-contain p-2" : "h-[220px] object-cover"}`}
                  draggable={false}
                />
              )}
              <span className="text-center text-[10px] font-medium text-gray-400">{label}</span>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
