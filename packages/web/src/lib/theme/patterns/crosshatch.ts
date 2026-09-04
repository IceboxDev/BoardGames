// Linen crosshatch background pattern. Discovered by the theme engine via
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
  key: "crosshatch",
  label: "Linen",
  tile: 40,
  generate(colorHex: string, opacity: number): string {
    const o = clamp01(opacity);
    const c = safeColor(colorHex);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'>
<g stroke='${c}' stroke-opacity='${o}' stroke-width='0.5'>
  <line x1='0' y1='0' x2='40' y2='40'/><line x1='10' y1='0' x2='40' y2='30'/>
  <line x1='20' y1='0' x2='40' y2='20'/><line x1='30' y1='0' x2='40' y2='10'/>
  <line x1='0' y1='10' x2='30' y2='40'/><line x1='0' y1='20' x2='20' y2='40'/>
  <line x1='0' y1='30' x2='10' y2='40'/>
  <line x1='40' y1='0' x2='0' y2='40'/><line x1='30' y1='0' x2='0' y2='30'/>
  <line x1='20' y1='0' x2='0' y2='20'/><line x1='10' y1='0' x2='0' y2='10'/>
  <line x1='40' y1='10' x2='10' y2='40'/><line x1='40' y1='20' x2='20' y2='40'/>
  <line x1='40' y1='30' x2='30' y2='40'/>
</g></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  },
} as const;
