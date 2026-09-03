// Star-field background pattern. Discovered by the theme engine via
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
  key: "constellation",
  label: "Stars",
  tile: 150,
  generate(colorHex: string, opacity: number): string {
    const o = clamp01(opacity);
    const c = safeColor(colorHex);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150' viewBox='0 0 150 150'>
<g fill='${c}'>
  <circle cx='20' cy='20' r='1.5' fill-opacity='${o}'/><circle cx='75' cy='10' r='1' fill-opacity='${o * 0.7}'/>
  <polygon points='130,23 132,25 130,27 128,25' fill-opacity='${o}'/>
  <circle cx='45' cy='55' r='1.2' fill-opacity='${o * 0.8}'/>
  <polygon points='110,48 112,50 110,52 108,50' fill-opacity='${o * 0.9}'/>
  <circle cx='15' cy='90' r='1' fill-opacity='${o * 0.5}'/>
  <circle cx='80' cy='80' r='1.8' fill-opacity='${o}'/>
  <circle cx='140' cy='85' r='1' fill-opacity='${o * 0.6}'/>
  <polygon points='55,113 57,115 55,117 53,115' fill-opacity='${o * 0.85}'/>
  <circle cx='100' cy='120' r='1' fill-opacity='${o * 0.55}'/>
  <circle cx='25' cy='140' r='1.2' fill-opacity='${o * 0.75}'/>
  <polygon points='135,138 137.5,140 135,142 132.5,140' fill-opacity='${o * 0.9}'/>
  <circle cx='60' cy='35' r='0.8' fill-opacity='${o * 0.45}'/>
  <circle cx='95' cy='95' r='0.8' fill-opacity='${o * 0.5}'/>
  <circle cx='30' cy='70' r='0.6' fill-opacity='${o * 0.35}'/>
</g>
<g stroke='${c}' stroke-opacity='${o * 0.3}' stroke-width='0.5' fill='none'>
  <line x1='20' y1='20' x2='45' y2='55'/><line x1='45' y1='55' x2='80' y2='80'/>
  <line x1='75' y1='10' x2='110' y2='50'/><line x1='110' y1='50' x2='130' y2='25'/>
  <line x1='80' y1='80' x2='100' y2='120'/><line x1='15' y1='90' x2='55' y2='115'/>
  <line x1='55' y1='115' x2='25' y2='140'/><line x1='135' y1='140' x2='140' y2='85'/>
</g></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  },
} as const;
