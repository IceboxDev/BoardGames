import type { CSSProperties, FC } from "react";
import "./aurora.css";

// Five gradient ribbons parameterized on the site's neon trio + accent (no
// hardcoded palette). Each ribbon is a wrapper (X drift) around a band
// (Y wave + static blur) so the two transform loops compose without
// `animation-composition`. Geometry is deterministic, so it lives here; the
// negative delays start every loop mid-phase so the ribbons never move in
// lockstep at mount.
const RIBBONS = [
  {
    id: "cyan-accent",
    background:
      "linear-gradient(90deg, transparent, var(--color-neon-cyan), var(--color-accent-400), transparent)",
    top: "5%",
    height: "30%",
    blur: 25,
    shift: 7,
    shiftDelay: -1.4,
    waveDelay: -0.6,
    amp: 30,
  },
  {
    id: "purple-cyan",
    background:
      "linear-gradient(90deg, transparent 15%, var(--color-neon-purple), var(--color-neon-cyan), transparent 85%)",
    top: "15%",
    height: "25%",
    blur: 35,
    shift: 9,
    shiftDelay: -4.7,
    waveDelay: -3.2,
    amp: 38,
  },
  {
    id: "accent-cyan",
    background:
      "linear-gradient(90deg, transparent, var(--color-accent-500), var(--color-neon-cyan), transparent)",
    top: "8%",
    height: "32%",
    blur: 30,
    shift: 11,
    shiftDelay: -8.1,
    waveDelay: -1.9,
    amp: 25,
  },
  {
    id: "accent-purple",
    background:
      "linear-gradient(90deg, transparent 10%, var(--color-accent-400), var(--color-neon-purple), transparent 90%)",
    top: "22%",
    height: "20%",
    blur: 40,
    shift: 8,
    shiftDelay: -2.9,
    waveDelay: -5.4,
    amp: 35,
  },
  {
    id: "pink-purple-cyan",
    background:
      "linear-gradient(90deg, transparent 5%, var(--color-neon-pink), var(--color-neon-purple), var(--color-neon-cyan), transparent 95%)",
    top: "30%",
    height: "18%",
    blur: 45,
    shift: 10,
    shiftDelay: -6.3,
    waveDelay: -2.7,
    amp: 40,
  },
];

// Randomized once at module scope so a remount never reshuffles the scene.
const SPARKLES = Array.from({ length: 20 }, (_, i) => ({
  id: `sparkle-${i}`,
  x: 5 + Math.random() * 90,
  y: 5 + Math.random() * 40,
  size: 1 + Math.random() * 2,
  delay: -(Math.random() * 3),
}));

// biome-ignore lint/style/useComponentExportOnlyModules: the component ships inside the default-exported effect definition the ambient registry discovers
const AuroraEffect: FC = () => {
  return (
    <div aria-hidden className="amb-aurora absolute inset-0 overflow-hidden pointer-events-none">
      <div className="amb-aurora-glow" />
      {RIBBONS.map((r) => (
        <div
          key={r.id}
          className="amb-aurora-ribbon"
          style={
            {
              top: r.top,
              height: r.height,
              "--amb-shift-dur": `${r.shift}s`,
              "--amb-shift-delay": `${r.shiftDelay}s`,
            } as CSSProperties
          }
        >
          <div
            className="amb-aurora-band"
            style={
              {
                background: r.background,
                filter: `blur(${r.blur}px)`,
                "--amb-wave-dur": `${r.shift + 2}s`,
                "--amb-wave-delay": `${r.waveDelay}s`,
                "--amb-amp": `${r.amp}px`,
              } as CSSProperties
            }
          />
        </div>
      ))}
      {SPARKLES.map((s) => (
        <div
          key={s.id}
          className="amb-aurora-sparkle"
          style={
            {
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              "--amb-delay": `${s.delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
};

const aurora = {
  key: "aurora",
  label: "Aurora",
  tier: "rich",
  Component: AuroraEffect,
} as const;

export default aurora;
