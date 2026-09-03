// Wavy-lines background pattern. Discovered by the theme engine via
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
  key: "waves",
  label: "Waves",
  tile: 120,
  generate(colorHex: string, opacity: number): string {
    const o = clamp01(opacity);
    const c = safeColor(colorHex);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'>
<g fill='none' stroke='${c}' stroke-opacity='${o}' stroke-width='1'>
  <path d='M0 20 Q30 10 60 20 Q90 30 120 20'/>
  <path d='M0 40 Q30 30 60 40 Q90 50 120 40'/>
  <path d='M0 60 Q30 50 60 60 Q90 70 120 60'/>
  <path d='M0 80 Q30 70 60 80 Q90 90 120 80'/>
  <path d='M0 100 Q30 90 60 100 Q90 110 120 100'/>
</g></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  },
} as const;
