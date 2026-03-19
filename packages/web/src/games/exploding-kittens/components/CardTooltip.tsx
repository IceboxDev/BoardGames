import type { CardType } from "@boardgames/core/games/exploding-kittens/types";
import {
  CARD_COLORS,
  CARD_EMOJI,
  CARD_LABELS,
} from "@boardgames/core/games/exploding-kittens/types";
import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCardImageUrl, getSkinsForType } from "../assets/card-art";

interface CardTooltipProps {
  cardType: CardType;
  children: ReactNode;
}

interface TooltipPos {
  left: number;
  top: number;
}

export default function CardTooltip({ cardType, children }: CardTooltipProps) {
  const [pos, setPos] = useState<TooltipPos | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const handleEnter = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceAbove = rect.top;
    const tooltipH = 260;
    const tooltipW = 150;

    let top: number;
    if (spaceAbove > tooltipH + 8) {
      top = rect.top - tooltipH - 4;
    } else {
      top = rect.bottom + 4;
    }

    let left = rect.left + rect.width / 2 - tooltipW / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipW - 8));

    setPos({ left, top });
  }, []);

  const handleLeave = useCallback(() => setPos(null), []);

  const skins = getSkinsForType(cardType);
  const skin = skins.length > 0 ? skins[0] : null;

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: tooltip hover trigger */}
      <span
        ref={triggerRef}
        className="inline-flex"
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {children}
      </span>
      {pos &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999]"
            style={{ left: pos.left, top: pos.top }}
          >
            <div className="flex w-[150px] flex-col items-center gap-1 rounded-xl bg-gray-900 p-1.5 shadow-2xl ring-1 ring-white/20">
              {skin ? (
                <img
                  src={getCardImageUrl(skin.file)}
                  alt={CARD_LABELS[cardType]}
                  className="h-[220px] w-full rounded-lg object-cover"
                  draggable={false}
                />
              ) : (
                <div
                  className="flex h-[220px] w-full flex-col items-center justify-center rounded-lg text-white"
                  style={{ backgroundColor: CARD_COLORS[cardType] }}
                >
                  <span className="text-3xl">{CARD_EMOJI[cardType]}</span>
                  <span className="mt-2 text-sm font-bold">{CARD_LABELS[cardType]}</span>
                </div>
              )}
              <span className="text-center text-[10px] font-medium text-gray-400">
                {CARD_LABELS[cardType]}
                {skin && <span className="text-gray-500"> — {skin.label}</span>}
              </span>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
