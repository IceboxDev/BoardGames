import "./scanlines.css";

// Ambient scanlines (cheap tier): a static CRT line texture plus two sweep
// bands gliding down the screen. The original's hardcoded chroma colors
// (rgba(255,0,80) / rgba(0,200,255)) are replaced with the neon-pink /
// neon-cyan theme tokens, and the sweeps animate transform instead of `top`.

// biome-ignore lint/style/useComponentExportOnlyModules: ambient effects export a { key, label, tier, Component } module contract, not a bare component
function Scanlines() {
  return (
    <div aria-hidden className="amb-scanlines absolute inset-0 overflow-hidden pointer-events-none">
      <div className="amb-scanline-texture" />
      <div className="amb-scanline-band" />
      <div className="amb-scanline-chroma" />
    </div>
  );
}

const scanlines = {
  key: "scanlines",
  label: "Scanlines",
  tier: "cheap",
  Component: Scanlines,
} as const;

export default scanlines;
