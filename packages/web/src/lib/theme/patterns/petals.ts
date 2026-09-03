// Falling-petals background pattern. Discovered by the theme engine via
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
  key: "petals",
  label: "Petals",
  tile: 200,
  generate(colorHex: string, opacity: number): string {
    const o = clamp01(opacity);
    const c = safeColor(colorHex);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'>
<g fill='${c}' fill-opacity='${o}'>
  <ellipse cx='35' cy='28' rx='4' ry='7' transform='rotate(42 35 28)'/>
  <ellipse cx='145' cy='22' rx='3' ry='6' transform='rotate(-18 145 22)'/>
  <ellipse cx='80' cy='95' rx='4' ry='8' transform='rotate(65 80 95)'/>
  <ellipse cx='25' cy='155' rx='3' ry='6' transform='rotate(-50 25 155)'/>
  <ellipse cx='170' cy='120' rx='4' ry='7' transform='rotate(28 170 120)'/>
  <ellipse cx='110' cy='175' rx='3' ry='7' transform='rotate(-35 110 175)'/>
  <circle cx='60' cy='50' r='1' opacity='0.4'/><circle cx='155' cy='80' r='1' opacity='0.3'/>
</g></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  },
} as const;
