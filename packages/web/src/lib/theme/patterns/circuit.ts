// Circuit-board background pattern. Discovered by the theme engine via
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
  key: "circuit",
  label: "Circuit",
  tile: 100,
  generate(colorHex: string, opacity: number): string {
    const o = clamp01(opacity);
    const c = safeColor(colorHex);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'>
<g stroke='${c}' stroke-opacity='${o}' stroke-width='1' fill='none'>
  <path d='M10 0v30h20v20'/><path d='M50 0v10h30v20'/><path d='M90 0v40'/>
  <path d='M0 50h20v30'/><path d='M40 40v20h20'/><path d='M80 30v30h20'/>
  <path d='M30 70h30v30'/><path d='M70 60v40'/><path d='M0 90h10'/>
</g>
<g fill='${c}' fill-opacity='${o}'>
  <circle cx='10' cy='30' r='2'/><circle cx='30' cy='50' r='2'/><circle cx='50' cy='10' r='2'/>
  <circle cx='80' cy='30' r='2'/><circle cx='90' cy='40' r='2'/><circle cx='20' cy='80' r='2'/>
  <circle cx='40' cy='40' r='2'/><circle cx='60' cy='60' r='2'/><circle cx='70' cy='60' r='2'/>
  <circle cx='60' cy='100' r='2'/><circle cx='100' cy='60' r='2'/>
</g></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  },
} as const;
