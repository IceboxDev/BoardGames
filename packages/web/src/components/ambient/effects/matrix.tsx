import { type CSSProperties, type FC, useMemo } from "react";
import "./matrix.css";

// CSS-only rewrite of the interval-driven original: each column is ONE div
// holding a pre-generated vertical glyph string, falling on a single
// translateY keyframe loop. The head glow + fading tail is a static gradient
// (background-clip: text) plus a mask on the column — no per-character state,
// no timers, no React state after mount.
const COLUMN_COUNT = 16;

function randomGlyph(): string {
  return Math.random() < 0.25
    ? String.fromCharCode(0x30 + Math.floor(Math.random() * 10)) // digits 0-9
    : String.fromCharCode(0x30a1 + Math.floor(Math.random() * 85)); // katakana
}

// biome-ignore lint/style/useComponentExportOnlyModules: the component ships inside the default-exported effect definition the ambient registry discovers
const MatrixEffect: FC = () => {
  const columns = useMemo(
    () =>
      Array.from({ length: COLUMN_COUNT }, (_, i) => {
        const duration = 5 + Math.random() * 6;
        const length = 10 + Math.floor(Math.random() * 14);
        return {
          id: `col-${i}`,
          x: i * 6.25 + Math.random() * 2.5,
          glyphs: Array.from({ length }, randomGlyph).join("\n"),
          duration,
          delay: -(Math.random() * duration),
        };
      }),
    [],
  );

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="amb-matrix-wash" />
      {columns.map((col) => (
        <div
          key={col.id}
          className="amb-matrix-col"
          style={
            {
              left: `${col.x}%`,
              "--amb-dur": `${col.duration}s`,
              "--amb-delay": `${col.delay}s`,
            } as CSSProperties
          }
        >
          {col.glyphs}
        </div>
      ))}
    </div>
  );
};

const matrix = {
  key: "matrix",
  label: "Matrix Rain",
  tier: "rich",
  Component: MatrixEffect,
} as const;

export default matrix;
