import cardsSheet from "./assets/cards.webp";

// The spritesheet is a 10-wide × 8-tall grid (255×393 per cell); a card's cell
// index is BGA's `img` value (0-76, row-major). Percentage background-position
// selects the cell: for an N-wide sheet, showing column c uses c/(N-1)·100%.
const COLS = 10;
const ROWS = 8;

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
        className={`inline-flex items-center justify-center rounded border border-white/15 bg-surface-800/80 px-1 text-center text-4xs leading-tight text-fg-primary ${className ?? ""}`}
        style={{ width, height }}
        title={name}
      >
        {name}
      </span>
    );
  }

  const col = img % COLS;
  const row = Math.floor(img / COLS);
  return (
    <span
      role="img"
      aria-label={name}
      className={`inline-block shrink-0 rounded-sm ring-1 ring-black/30 ${className ?? ""}`}
      style={{
        width,
        height,
        backgroundImage: `url(${cardsSheet})`,
        backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
        backgroundPosition: `${(col / (COLS - 1)) * 100}% ${(row / (ROWS - 1)) * 100}%`,
      }}
      title={name}
    />
  );
}
