// Board-game doodles background pattern (WhatsApp-wallpaper style). The 16
// glyph positions, rotations, and footprints match the original hand-tuned
// layout; the glyphs themselves are board-game icons — cards, dice, pawns,
// meeples, hexes, a d20, an hourglass, a trophy, a crown.
// Discovered by the theme engine via import.meta.glob — must stay a
// self-contained default export.

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
  key: "doodles",
  label: "Doodles",
  tile: 300,
  generate(colorHex: string, opacity: number): string {
    const o = clamp01(opacity);
    const c = safeColor(colorHex);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'>
<g fill='${c}' fill-opacity='${o}'>
  <g transform='translate(18,22) rotate(-8 12 12)'><g fill='none' stroke='${c}' stroke-opacity='${o}' stroke-width='1.5'><rect x='0' y='5' width='9' height='13' rx='1' transform='rotate(-14 4.5 11.5)'/><rect x='5.5' y='3' width='9' height='13' rx='1'/><rect x='11' y='5' width='9' height='13' rx='1' transform='rotate(14 15.5 11.5)'/></g></g>
  <g transform='translate(105,8) rotate(12 8 8)'><rect width='16' height='16' rx='3' fill='none' stroke='${c}' stroke-opacity='${o}' stroke-width='1.5'/><circle cx='4.5' cy='4.5' r='1.3'/><circle cx='11.5' cy='4.5' r='1.3'/><circle cx='8' cy='8' r='1.3'/><circle cx='4.5' cy='11.5' r='1.3'/><circle cx='11.5' cy='11.5' r='1.3'/></g>
  <g transform='translate(225,35) rotate(-5 7 9)'><path d='M7 0c1.5 0 2.7 1.2 2.7 2.7c0 1-.6 1.9-1.4 2.4l2.2 5.4H3.5l2.2-5.4C4.9 4.6 4.3 3.7 4.3 2.7C4.3 1.2 5.5 0 7 0zM3 11.5h8v2.5H3z'/></g>
  <g transform='translate(62,68) rotate(18 8 5)'><rect width='14' height='10' rx='2' fill='none' stroke='${c}' stroke-opacity='${o}' stroke-width='1.5'/><line x1='7' y1='0' x2='7' y2='10' stroke='${c}' stroke-opacity='${o * 0.8}' stroke-width='1'/><circle cx='3.5' cy='5' r='1'/><circle cx='10.5' cy='3' r='1'/><circle cx='10.5' cy='7' r='1'/></g>
  <g transform='translate(175,80) rotate(-15 8 8)'><path d='M8 0l6.9 4v8L8 16l-6.9-4V4z' fill='none' stroke='${c}' stroke-opacity='${o}' stroke-width='1.5' stroke-linejoin='round'/><path d='M8 3.5l4.3 7.4H3.7z' fill='none' stroke='${c}' stroke-opacity='${o}' stroke-width='1'/><path d='M8 0v3.5M14.9 4l-2.6 6.9M1.1 4l2.6 6.9M14.9 12l-2.6-1.1M1.1 12l2.6-1.1M8 16v-2' fill='none' stroke='${c}' stroke-opacity='${o * 0.7}' stroke-width='1'/></g>
  <g transform='translate(255,120) rotate(22 5 7)'><path d='M0 0h10l-3.5 7.5L10 15H0l3.5-7.5L0 0z' fill='none' stroke='${c}' stroke-opacity='${o}' stroke-width='1.5' stroke-linejoin='round'/><circle cx='5' cy='12.5' r='1'/></g>
  <g transform='translate(30,140) rotate(-25 6 6)'><path d='M6.5 0c1.7 0 3 1.4 3 3.1c0 .8-.3 1.5-.8 2c2.6.7 4.3 2.1 4.3 3.4c0 .9-.8 1.5-1.9 1.5c-.8 0-1.7-.3-2.5-.8l1 4.8h-1.8L6.5 11.2L5.2 14H3.4l1-4.8c-.8.5-1.7.8-2.5.8C.8 10 0 9.4 0 8.5c0-1.3 1.7-2.7 4.3-3.4c-.5-.5-.8-1.2-.8-2C3.5 1.4 4.8 0 6.5 0z' fill='none' stroke='${c}' stroke-opacity='${o}' stroke-width='1.5' stroke-linejoin='round'/></g>
  <g transform='translate(140,145) rotate(8 9 9)'><path d='M9 0l7.8 4.5v9L9 18l-7.8-4.5v-9z' fill='none' stroke='${c}' stroke-opacity='${o}' stroke-width='1.5' stroke-linejoin='round'/><path d='M9 0v18M1.2 4.5l15.6 9M16.8 4.5L1.2 13.5' fill='none' stroke='${c}' stroke-opacity='${o * 0.5}' stroke-width='1'/></g>
  <g transform='translate(85,195) rotate(-12 10 5)'><rect x='0' y='0.5' width='9' height='9' rx='1.5' fill='none' stroke='${c}' stroke-opacity='${o}' stroke-width='1.5'/><rect x='11' y='0.5' width='9' height='9' rx='1.5' fill='none' stroke='${c}' stroke-opacity='${o}' stroke-width='1.5'/><circle cx='4.5' cy='5' r='1.1'/><circle cx='13.8' cy='3.2' r='1.1'/><circle cx='17.2' cy='6.8' r='1.1'/></g>
  <g transform='translate(220,190) rotate(15 7 7)'><rect x='1.5' width='11' height='14' rx='1.5' fill='none' stroke='${c}' stroke-opacity='${o}' stroke-width='1.5'/><path d='M7 4.2l2 2.8-2 2.8-2-2.8z' fill='none' stroke='${c}' stroke-opacity='${o * 0.6}' stroke-width='1' stroke-linejoin='round'/></g>
  <g transform='translate(38,248) rotate(10 4 4)'><path d='M4 0a2.3 2.3 0 0 1 1.2 4.3l1.5 4H1.3l1.5-4A2.3 2.3 0 0 1 4 0zM1 9.8h6v1.8H1z' fill='none' stroke='${c}' stroke-opacity='${o}' stroke-width='1.2' stroke-linejoin='round'/></g>
  <g transform='translate(160,255) rotate(-20 7 7)'><circle cx='7' cy='7' r='7' fill='none' stroke='${c}' stroke-opacity='${o}' stroke-width='1.5'/><path d='M7 3.6l1 2.3 2.5.3-1.9 1.6.6 2.5L7 9l-2.2 1.3.6-2.5-1.9-1.6 2.5-.3z' fill='none' stroke='${c}' stroke-opacity='${o}' stroke-width='1' stroke-linejoin='round'/></g>
  <g transform='translate(265,215) rotate(6 10 5)'><path d='M1 10h18l-2-8-4.5 4.5L10 0L7.5 6.5L3 2z' fill='none' stroke='${c}' stroke-opacity='${o}' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></g>
  <g transform='translate(120,268) rotate(-10 6 6)'><rect width='12' height='12' rx='2.5' fill='none' stroke='${c}' stroke-opacity='${o}' stroke-width='1.5'/><circle cx='6' cy='6' r='1.4'/></g>
  <g transform='translate(245,270) rotate(28 6 5)'><path d='M3 0h6l3 5-3 5H3L0 5z' fill='none' stroke='${c}' stroke-opacity='${o}' stroke-width='1.5' stroke-linejoin='round'/></g>
  <g transform='translate(195,42) rotate(-18 5 5)'><path d='M1 0h8l-.7 5a3.4 3.4 0 0 1-6.6 0L1 0zM5 8.4v1.8M2.8 10.2h4.4' fill='none' stroke='${c}' stroke-opacity='${o}' stroke-width='1.5' stroke-linecap='round'/><line x1='5' y1='2' x2='5' y2='6' stroke='${c}' stroke-opacity='${o * 0.5}' stroke-width='1'/></g>
</g></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  },
} as const;
