import type { CSSProperties } from "react";
import "./waves.css";

// Ambient waves (cheap tier): four layered wave SVGs drawn at 200% width and
// slid left by exactly half their own width on a linear loop — a true
// conveyor. Every path below is PERIODIC over 500 viewBox units (its second
// half repeats the first exactly), which is what makes the wrap invisible;
// the original's paths 1 and 3 were not, and only got away with it because
// they played `alternate` and never actually wrapped.
//
// Rising bubbles and a soft radial caustic complete the composition. All
// animation is transform/opacity only.

const WAVE_PATHS = [
  "M0,50 C150,20 350,80 500,50 C650,20 850,80 1000,50 L1000,100 L0,100 Z",
  "M0,55 C120,30 380,75 500,55 C620,30 880,75 1000,55 L1000,100 L0,100 Z",
  "M0,60 C180,35 320,85 500,60 C680,35 820,85 1000,60 L1000,100 L0,100 Z",
  "M0,65 C200,45 400,80 500,65 C700,45 900,80 1000,65 L1000,100 L0,100 Z",
];

// `top` + `height` sum to 100% per layer so every translucent fill reaches
// the container bottom; a fixed height would end each fill mid-screen and
// full-bleed rendering shows that as a horizontal seam.
const WAVES = WAVE_PATHS.map((d, i) => ({
  id: `wave-${i}`,
  index: i,
  d,
  top: `${30 + i * 15}%`,
  height: `${70 - i * 15}%`,
  duration: `${12 + i * 2}s`,
  opacity: 0.03 + i * 0.015,
}));

// Randomized once at module scope: bubble placement is a fixture of the
// theme, so it must not reshuffle when the host remounts the layer.
const BUBBLES = Array.from({ length: 8 }, (_, i) => {
  const duration = 4 + Math.random() * 5;
  return {
    id: `bubble-${i}`,
    x: 5 + Math.random() * 90,
    size: 1.5 + Math.random() * 2,
    // Static resting height for the reduced-motion composition.
    restY: 10 + Math.random() * 45,
    delay: -(Math.random() * duration),
    duration,
  };
});

// biome-ignore lint/style/useComponentExportOnlyModules: ambient effects export a { key, label, tier, Component } module contract, not a bare component
function Waves() {
  return (
    <div aria-hidden className="amb-waves absolute inset-0 overflow-hidden pointer-events-none">
      <div className="amb-wave-caustic" />
      {WAVES.map((w) => (
        <svg
          key={w.id}
          className={`amb-wave amb-wave--${w.index}`}
          style={
            {
              top: w.top,
              height: w.height,
              opacity: w.opacity,
              "--amb-wave-duration": w.duration,
            } as CSSProperties
          }
          viewBox="0 0 1000 100"
          preserveAspectRatio="none"
          role="presentation"
        >
          <path d={w.d} fill="var(--color-accent-500)" />
        </svg>
      ))}
      {BUBBLES.map((b) => (
        <div
          key={b.id}
          className="amb-wave-bubble"
          style={
            {
              left: `${b.x}%`,
              width: `${b.size}px`,
              height: `${b.size}px`,
              "--amb-bubble-rest-y": `${-b.restY}vh`,
              "--amb-bubble-duration": `${b.duration}s`,
              "--amb-bubble-delay": `${b.delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

const waves = {
  key: "waves",
  label: "Waves",
  tier: "cheap",
  Component: Waves,
} as const;

export default waves;
