import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface CardTagProps {
  /** Text label for the card. */
  label: string;
  /** Hex color for the tag, e.g. "#ea580c". Defaults to neutral gray. */
  color?: string;
  /** Image URL for the tooltip and full-screen preview. */
  imageUrl?: string;
  /** Custom tooltip content (overrides default image tooltip). */
  tooltipContent?: ReactNode;
}

interface TooltipPos {
  left: number;
  top: number;
}

const TOOLTIP_W = 150;
const TOOLTIP_H = 260;
const LONG_HOVER_MS = 1400;

function hexToRgba(hex: string, alpha: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function CardTag({ label, color, imageUrl, tooltipContent }: CardTagProps) {
  const [tooltipPos, setTooltipPos] = useState<TooltipPos | null>(null);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const longHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasTooltip = imageUrl || tooltipContent;

  const handleEnter = useCallback(() => {
    if (!hasTooltip) return;
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

    setTooltipPos({ left, top });

    longHoverTimer.current = setTimeout(() => {
      setShowFullPreview(true);
    }, LONG_HOVER_MS);
  }, [hasTooltip]);

  const handleLeave = useCallback(() => {
    setTooltipPos(null);
    setShowFullPreview(false);
    if (longHoverTimer.current) {
      clearTimeout(longHoverTimer.current);
      longHoverTimer.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (longHoverTimer.current) {
        clearTimeout(longHoverTimer.current);
      }
    };
  }, []);

  const bgColor = color ? hexToRgba(color, 0.2) : "rgba(255, 255, 255, 0.1)";
  const textColor = color ?? "rgba(255, 255, 255, 0.9)";
  const isSvg = imageUrl?.endsWith(".svg");

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: tooltip hover trigger */}
      <span
        ref={triggerRef}
        className="inline-flex items-center rounded px-1 py-0.5 text-[11px] font-medium transition hover:brightness-125"
        style={{
          backgroundColor: bgColor,
          color: textColor,
          border: `1px solid ${color ? hexToRgba(color, 0.4) : "rgba(255, 255, 255, 0.15)"}`,
          cursor: hasTooltip ? "help" : undefined,
        }}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {label}
      </span>

      {/* Small tooltip preview */}
      {tooltipPos &&
        !showFullPreview &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999]"
            style={{ left: tooltipPos.left, top: tooltipPos.top }}
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

      {/* Full-screen preview on prolonged hover */}
      {showFullPreview &&
        createPortal(
          <div className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center bg-black/70">
            <div className="w-80">
              {tooltipContent ?? (
                <img
                  src={imageUrl}
                  alt={label}
                  className={`w-full rounded-2xl shadow-2xl ${isSvg ? "bg-white object-contain p-4" : "object-cover"}`}
                  draggable={false}
                />
              )}
              <div className="mt-2 text-center text-sm font-medium text-white/80">{label}</div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
