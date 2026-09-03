// Nested-diamonds background pattern. Discovered by the theme engine via
// import.meta.glob — must stay a self-contained default export.

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

// encodeURIComponent leaves single quotes unescaped, so an arbitrary string
// interpolated into the SVG attributes could break out of them. Only
// well-formed hex colors pass through; anything else falls back to grey.
function safeColor(colorHex: string): string {
  return HEX_COLOR.test(colorHex) ? colorHex : "#888888";
}

export default {
  key: "diamonds",
  label: "Diamonds",
  tile: 60,
  generate(colorHex: string, opacity: number): string {
    const o = clamp01(opacity);
    const c = safeColor(colorHex);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'>
<g fill='none' stroke='${c}' stroke-opacity='${o}' stroke-width='0.8'>
  <path d='M30 0L60 30L30 60L0 30Z'/>
  <path d='M30 10L50 30L30 50L10 30Z'/>
</g></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  },
} as const;
