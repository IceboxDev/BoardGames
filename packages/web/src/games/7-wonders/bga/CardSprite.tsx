import { SHEET, spriteStyle } from "../logic/card-art";

// A card's cell index is BGA's `img` value (0-76, row-major); the sheet and
// its maths are shared with the game board (`logic/card-art.ts`).
const COLS = SHEET.cols;
const ROWS = SHEET.rows;

interface CardSpriteProps {
  /** Sprite cell index (0-76), or undefined to show the name fallback. */
  img: number | undefined;
  name: string;
  /** Rendered width in px; height follows the 255:393 card aspect. */
  width?: number;
  className?: string;
}

export default function CardSprite({ img, name, width = 46, className }: CardSpriteProps) {
  const height = Math.round((width * 393) / 255);

  if (img === undefined || img < 0 || img >= COLS * ROWS) {
    // No sprite for this card (unknown/expansion not in the sheet) — name chip.
    return (
      <span
        className={`inline-flex items-center justify-center rounded border border-line-strong bg-surface-800/80 px-1 text-center text-5xs leading-tight text-fg-primary ${className ?? ""}`}
        style={{ width, height }}
        title={name}
      >
        {name}
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={name}
      className={`inline-block shrink-0 rounded-sm ring-1 ring-black/30 ${className ?? ""}`}
      style={{ width, height, ...spriteStyle(img, SHEET.cellW / SHEET.cellH) }}
      title={name}
    />
  );
}
