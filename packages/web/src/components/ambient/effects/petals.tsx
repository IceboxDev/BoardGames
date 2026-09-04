import { type CSSProperties, type FC, useMemo } from "react";
import "./petals.css";

// 21 falling + 3 settled = 24 petals total (the layer cap for this effect).
const FALLING_COUNT = 21;
const SETTLED_COUNT = 3;

const FLUTTER_CLASSES = ["amb-petal-a", "amb-petal-b", "amb-petal-c"];

const PETAL_TINTS = [
  "color-mix(in srgb, var(--color-neon-pink) 55%, transparent)",
  "color-mix(in srgb, var(--color-accent-400) 48%, transparent)",
  "color-mix(in srgb, var(--color-neon-purple) 45%, transparent)",
];

// biome-ignore lint/style/useComponentExportOnlyModules: the component ships inside the default-exported effect definition the ambient registry discovers
const PetalsEffect: FC = () => {
  const falling = useMemo(
    () =>
      Array.from({ length: FALLING_COUNT }, (_, i) => {
        const tier = i < 7 ? 0 : i < 15 ? 1 : 2;
        const duration = [6 + Math.random() * 3, 8 + Math.random() * 4, 10 + Math.random() * 4][
          tier
        ];
        return {
          id: `petal-${i}`,
          x: Math.random() * 110 - 5,
          size: [6 + Math.random() * 4, 10 + Math.random() * 6, 16 + Math.random() * 6][tier],
          duration,
          delay: -(Math.random() * duration),
          rotation: Math.random() * 360,
          tumble: Math.random() > 0.5,
          tumbleDuration: 2.5 + Math.random() * 2.5,
          flutterClass: FLUTTER_CLASSES[tier],
          tint: PETAL_TINTS[i % PETAL_TINTS.length],
        };
      }),
    [],
  );

  const settled = useMemo(
    () =>
      Array.from({ length: SETTLED_COUNT }, (_, i) => ({
        id: `settled-${i}`,
        x: 15 + i * 30 + Math.random() * 15,
        size: 10 + Math.random() * 5,
        rotation: 40 + Math.random() * 100,
      })),
    [],
  );

  return (
    <div aria-hidden className="amb-petals absolute inset-0 overflow-hidden pointer-events-none">
      {falling.map((p) => (
        <div
          key={p.id}
          className={`amb-petal ${p.flutterClass}`}
          style={
            {
              left: `${p.x}%`,
              width: `${p.size}px`,
              height: `${p.size * 0.6}px`,
              "--amb-dur": `${p.duration}s`,
              "--amb-delay": `${p.delay}s`,
            } as CSSProperties
          }
        >
          <div
            className={p.tumble ? "amb-petal-shape amb-petal-tumble" : "amb-petal-shape"}
            style={
              {
                background: p.tint,
                "--amb-rot": `${p.rotation}deg`,
                "--amb-tumble-dur": `${p.tumbleDuration}s`,
              } as CSSProperties
            }
          />
        </div>
      ))}
      {settled.map((s) => (
        <div
          key={s.id}
          className="amb-petal-settled"
          style={
            {
              left: `${s.x}%`,
              width: `${s.size}px`,
              height: `${s.size * 0.5}px`,
              transform: `rotate(${s.rotation}deg)`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
};

const petals = {
  key: "petals",
  label: "Petals",
  tier: "rich",
  Component: PetalsEffect,
} as const;

export default petals;
