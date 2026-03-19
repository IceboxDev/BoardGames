import type { ReactNode } from "react";

export interface CardRenderState {
  isHovered: boolean;
  isDragging: boolean;
}

export interface CardFanProps<T> {
  cards: T[];
  getCardId: (card: T) => string | number;

  /** Render the card face. Receives the card data + interactive state flags. */
  renderCard: (card: T, state: CardRenderState) => ReactNode;

  /** Render the large card for full-screen preview. If omitted, preview is disabled. */
  renderPreview?: (card: T) => ReactNode;

  /** Called when a card is clicked (not dragged). */
  onCardClick?: (card: T) => void;

  /** Called when a card drag ends. Receives card + final pointer coords for drop-zone detection. */
  onCardDragEnd?: (card: T, point: { x: number; y: number }) => void;

  /** Per-card predicate: controls visual glow/playability hint. */
  isPlayable?: (card: T) => boolean;

  /** If true, all interactions are disabled (opponent turn, etc). */
  disabled?: boolean;

  /** Max fan rotation in degrees (default 15). Smaller for fewer cards. */
  maxRotation?: number;

  /** Preview delay in ms (default 700). */
  previewDelay?: number;
}

export interface FanCardLayout {
  x: number;
  y: number;
  rotation: number;
  zIndex: number;
}
