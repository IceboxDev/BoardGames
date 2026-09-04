import { type CSSProperties, type FC, useMemo } from "react";
import "./embers.css";

const EMBER_COUNT = 12;
const SMOKE_COUNT = 12;

// biome-ignore lint/style/useComponentExportOnlyModules: the component ships inside the default-exported effect definition the ambient registry discovers
const EmbersEffect: FC = () => {
  // Each particle is a wrapper (opacity fade) around an inner shape
  // (transform rise + static blur), so the blurred element's animation stays
  // transform-only and its blur paints exactly once.
  const embers = useMemo(
    () =>
      Array.from({ length: EMBER_COUNT }, (_, i) => {
        const duration = 4 + Math.random() * 4;
        return {
          id: `ember-${i}`,
          x: 5 + Math.random() * 90,
          size: 2 + Math.random() * 2.5,
          duration,
          delay: -(Math.random() * duration),
          sway: 15 + Math.random() * 30,
        };
      }),
    [],
  );

  const smoke = useMemo(
    () =>
      Array.from({ length: SMOKE_COUNT }, (_, i) => {
        const duration = 7 + Math.random() * 5;
        return {
          id: `smoke-${i}`,
          x: 10 + Math.random() * 80,
          size: 10 + Math.random() * 14,
          duration,
          delay: -(Math.random() * duration),
        };
      }),
    [],
  );

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="amb-embers-glow" />
      {smoke.map((s) => (
        <div
          key={s.id}
          className="amb-ember-smoke"
          style={
            {
              left: `${s.x}%`,
              bottom: "-20px",
              width: `${s.size}px`,
              height: `${s.size}px`,
              "--amb-dur": `${s.duration}s`,
              "--amb-delay": `${s.delay}s`,
            } as CSSProperties
          }
        >
          <div className="amb-ember-smoke-puff" />
        </div>
      ))}
      {embers.map((e) => (
        <div
          key={e.id}
          className="amb-ember"
          style={
            {
              left: `${e.x}%`,
              bottom: "-5px",
              width: `${e.size}px`,
              height: `${e.size}px`,
              "--amb-dur": `${e.duration}s`,
              "--amb-delay": `${e.delay}s`,
              "--amb-sway": `${e.sway}px`,
            } as CSSProperties
          }
        >
          <div className="amb-ember-spark" />
        </div>
      ))}
    </div>
  );
};

const embers = {
  key: "embers",
  label: "Embers",
  tier: "rich",
  Component: EmbersEffect,
} as const;

export default embers;
