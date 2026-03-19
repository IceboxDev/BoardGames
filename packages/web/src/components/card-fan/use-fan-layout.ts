import { useMemo } from "react";
import type { FanCardLayout } from "./types";

const CARD_WIDTH = 160;
const OVERLAP_FACTOR = 0.45;
const ARC_FACTOR = 2;
const HOVER_LIFT = 50;
const HOVER_SCALE = 1.08;
const SPREAD_AMOUNT = 40;
const BOTTOM_CROP = 24;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface FanLayoutResult {
  cards: FanCardTransform[];
  fanWidth: number;
}

export interface FanCardTransform extends FanCardLayout {
  scale: number;
  hoverX: number;
}

export function computeFanLayout(
  cardCount: number,
  hoveredIndex: number | null,
  maxRotation: number,
  containerWidth: number,
): FanLayoutResult {
  if (cardCount === 0) return { cards: [], fanWidth: 0 };

  const spacing = CARD_WIDTH * OVERLAP_FACTOR;
  const idealWidth = (cardCount - 1) * spacing + CARD_WIDTH;
  const availableWidth = Math.max(containerWidth, CARD_WIDTH);
  const actualSpacing =
    idealWidth > availableWidth && cardCount > 1
      ? (availableWidth - CARD_WIDTH) / (cardCount - 1)
      : spacing;
  const fanWidth = (cardCount - 1) * actualSpacing + CARD_WIDTH;

  const halfCount = cardCount > 1 ? (cardCount - 1) / 2 : 1;
  const angleStep = clamp(maxRotation / halfCount, 0.5, 5);

  const cards: FanCardTransform[] = [];

  for (let i = 0; i < cardCount; i++) {
    const t = i - (cardCount - 1) / 2;

    const rotation = t * angleStep;
    const arcY = t * t * ARC_FACTOR;
    const x = i * actualSpacing;
    const baseZ = cardCount - Math.abs(Math.round(t));

    let hoverX = 0;
    let liftY = 0;
    let scale = 1;
    let zIndex = baseZ;

    if (hoveredIndex !== null) {
      if (i === hoveredIndex) {
        liftY = HOVER_LIFT;
        scale = HOVER_SCALE;
        zIndex = 50;
      } else {
        const distance = Math.abs(i - hoveredIndex);
        const direction = Math.sign(i - hoveredIndex);
        hoverX = direction * (SPREAD_AMOUNT / distance);
      }
    }

    cards.push({
      x,
      y: arcY - liftY + BOTTOM_CROP,
      rotation,
      zIndex,
      scale,
      hoverX,
    });
  }

  return { cards, fanWidth };
}

export function useFanLayout(
  cardCount: number,
  hoveredIndex: number | null,
  maxRotation: number,
  containerWidth: number,
): FanLayoutResult {
  return useMemo(
    () => computeFanLayout(cardCount, hoveredIndex, maxRotation, containerWidth),
    [cardCount, hoveredIndex, maxRotation, containerWidth],
  );
}
