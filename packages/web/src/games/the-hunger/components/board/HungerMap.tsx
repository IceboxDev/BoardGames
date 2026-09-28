import { graphFor } from "@boardgames/core/games/the-hunger/board";
import { bonusDef } from "@boardgames/core/games/the-hunger/content/bonus-tokens";
import type { HungerPlayerView, PathKind, SpaceDef } from "@boardgames/core/games/the-hunger/types";
import { motion, useReducedMotion } from "framer-motion";
import type { KeyboardEvent } from "react";
import {
  BoardSurface,
  boardSpring,
  pulseRingAnimation,
  pulseRingTransition,
} from "../../../../components/board";
import { artUrl, EFFECT_ICON, vampireArt, vampireFace } from "../../logic/art";
import {
  bonusName,
  bonusShort,
  EFFECT_GLYPH,
  EFFECT_LABEL,
  spaceLabel,
  vampireColor,
} from "../../logic/labels";
import { boardImage, PATH_STROKE, REGION_FILL, SPACE_R, scaleOf, viewBoxOf } from "./geometry";

export interface MapTarget {
  space: string;
  label: string;
}

interface Props {
  view: HungerPlayerView;
  targets: readonly MapTarget[];
  onTarget: (space: string) => void;
  activeSeat: number;
}

/**
 * The night map. On a mapped board the printed art is drawn underneath and
 * the SVG only marks spaces, targets and Vampires; on a provisional or test
 * layout the SVG draws the whole board itself.
 */
/** Each space's place icon, white ink (undefined until generated). */
const effectIcons: Partial<Record<string, string>> = Object.fromEntries(
  Object.entries(EFFECT_ICON).map(([effect, name]) => [effect, name ? artUrl(name) : undefined]),
);

/** Bonus-token art for the Chests: the back (face down), the disc (face up), a looted outline. */
const tokenBack = artUrl("bonus-token-back");
const tokenFront = artUrl("bonus-token-disc");
const openIcon = artUrl("icon-chest-open");

export default function HungerMap({ view, targets, onTarget, activeSeat }: Props) {
  const g = graphFor(view.options);
  const def = g.def;
  const reduced = useReducedMotion();
  const byId = g.spaces;
  const k = scaleOf(def);
  const image = def.provisional ? undefined : boardImage(def.side);
  const box = viewBoxOf(def);

  const stacks = new Map<string, typeof view.players>();
  for (const p of [...view.players].sort((a, b) => a.placedAt - b.placedAt)) {
    stacks.set(p.pos, [...(stacks.get(p.pos) ?? []), p]);
  }

  const edgePath = (a: SpaceDef, b: SpaceDef): PathKind => a.path ?? b.path ?? "road";
  const radius = (s: SpaceDef) =>
    k *
    (s.effect === "castle" || s.effect === "labyrinth"
      ? SPACE_R * 1.8
      : s.effect === "cemetery"
        ? SPACE_R * 1.4
        : SPACE_R);

  const handleKey = (e: KeyboardEvent<SVGGElement>, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onTarget(id);
    }
  };

  return (
    <BoardSurface
      viewBox={box}
      aria-label="The night map"
      className="h-full w-full"
      underlay={
        image ? (
          <img src={image} alt="" className="absolute inset-0 h-full w-full object-contain" />
        ) : undefined
      }
    >
      {!image && (
        <g aria-hidden pointerEvents="none">
          <rect x={0} y={0} width={box.width} height={box.height} fill="#141019" />
          {def.edges.map(([a, b]) => {
            const sa = byId.get(a);
            const sb = byId.get(b);
            if (!sa || !sb) return null;
            const stroke = PATH_STROKE[edgePath(sa, sb)];
            return (
              <line
                key={`${a}-${b}`}
                x1={sa.x}
                y1={sa.y}
                x2={sb.x}
                y2={sb.y}
                stroke={stroke.color}
                strokeWidth={8 * k}
                strokeDasharray={stroke.dash}
                strokeLinecap="round"
                opacity={0.85}
              />
            );
          })}
        </g>
      )}

      {def.spaces.map((s) => {
        const chest = view.chests[s.id];
        const r = radius(s);
        const label = spaceLabel(view.options, s.id);
        const badge = (text: string | number, color: string) => (
          <text
            x={s.x + r * 0.9}
            y={s.y - r * 0.7}
            fontSize={22 * k}
            fontWeight={700}
            fill={color}
            stroke="#140d18"
            strokeWidth={4 * k}
            paintOrder="stroke"
            pointerEvents="none"
            aria-hidden
          >
            {text}
          </text>
        );
        return (
          <g key={s.id}>
            <title>
              {label}
              {s.mountainPenalty ? ` — sunrise −${s.mountainPenalty} VP` : ""}
            </title>
            {image ? (
              // The art already shows the space: a faint ring keeps it findable.
              <circle
                cx={s.x}
                cy={s.y}
                r={r}
                fill="transparent"
                stroke="#f5edff"
                strokeOpacity={0.25}
                strokeWidth={2 * k}
              />
            ) : (
              <>
                <circle
                  cx={s.x}
                  cy={s.y}
                  r={r}
                  fill={REGION_FILL[s.region]}
                  stroke={s.effect === "well" ? "#7dd3fc" : "#e8dff5"}
                  strokeWidth={(s.effect === "well" ? 5 : 2.5) * k}
                />
                {effectIcons[s.effect] ? (
                  <image
                    href={effectIcons[s.effect]}
                    x={s.x - r * 0.62}
                    y={s.y - r * 0.62}
                    width={r * 1.24}
                    height={r * 1.24}
                    pointerEvents="none"
                    aria-hidden
                  />
                ) : (
                  EFFECT_GLYPH[s.effect] && (
                    <text
                      x={s.x}
                      y={s.y + r / 3}
                      textAnchor="middle"
                      fontSize={r}
                      pointerEvents="none"
                      aria-hidden
                    >
                      {EFFECT_GLYPH[s.effect]}
                    </text>
                  )
                )}
                {s.mountainPenalty ? (
                  <text
                    x={s.x}
                    y={s.y + r + 24 * k}
                    textAnchor="middle"
                    fontSize={20 * k}
                    fill="#fca5a5"
                    pointerEvents="none"
                    aria-hidden
                  >
                    −{s.mountainPenalty}
                  </text>
                ) : null}
                {(s.effect === "castle" || s.effect === "labyrinth" || s.effect === "cemetery") && (
                  <text
                    x={s.x}
                    y={s.y - r - 8 * k}
                    textAnchor="middle"
                    fontSize={16 * k}
                    fill="#bfb6cc"
                    pointerEvents="none"
                    aria-hidden
                  >
                    {EFFECT_LABEL[s.effect]}
                  </text>
                )}
              </>
            )}
            {(s.effect === "chest" || s.effect === "chest-open") && chest !== undefined && (
              <ChestMarker
                x={s.x - r * 1.25}
                y={s.y - r * 1.35}
                k={k}
                chest={chest}
                reduced={Boolean(reduced)}
              />
            )}
            {s.effect === "crypt" && badge(view.crypts[s.id] ?? 0, "#fde68a")}
            {s.effect === "tavern" && badge(view.tavernCount, "#fde68a")}
          </g>
        );
      })}

      <g>
        {targets.map((t) => {
          const s = byId.get(t.space);
          if (!s) return null;
          const r = radius(s) * 1.2;
          return (
            // biome-ignore lint/a11y/useSemanticElements: <g role="button"> is the standard ARIA pattern for an interactive SVG region — an HTML <button> can't host SVG children
            <g
              key={`target-${t.space}`}
              data-space={t.space}
              role="button"
              tabIndex={0}
              aria-label={t.label}
              onClick={() => onTarget(t.space)}
              onKeyDown={(e) => handleKey(e, t.space)}
              style={{ cursor: "pointer" }}
            >
              <title>{t.label}</title>
              <motion.circle
                cx={s.x}
                cy={s.y}
                r={r + 12 * k}
                fill="rgba(52, 211, 153, 0.18)"
                stroke="#34d399"
                strokeWidth={5 * k}
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
                animate={reduced ? undefined : pulseRingAnimation}
                transition={reduced ? undefined : pulseRingTransition}
              />
            </g>
          );
        })}
      </g>

      {/* Where each Vampire stands: a glow ring on the space in its colour… */}
      <g pointerEvents="none">
        {[...stacks.entries()].flatMap(([spaceId, stack]) => {
          const s = byId.get(spaceId);
          if (!s) return [];
          return stack.map((p, i) => (
            <circle
              key={`ring-${p.index}`}
              cx={s.x}
              cy={s.y}
              r={radius(s) * 1.2 + i * 6 * k}
              fill="none"
              stroke={vampireColor(p.vampire)}
              strokeWidth={5 * k}
              opacity={0.95}
              style={{ filter: `drop-shadow(0 0 ${8 * k}px ${vampireColor(p.vampire)})` }}
            />
          ));
        })}
      </g>
      {/* …and a pin above it with the Vampire's face. */}
      <g pointerEvents="none">
        {[...stacks.entries()].flatMap(([spaceId, stack]) => {
          const s = byId.get(spaceId);
          if (!s) return [];
          return stack.map((p, i) => (
            <motion.g
              key={`vamp-${p.index}`}
              initial={false}
              animate={{
                x: s.x + (i - (stack.length - 1) / 2) * PIN_R * 1.9 * k,
                y: s.y - radius(s) * 0.35,
              }}
              transition={reduced ? { duration: 0 } : boardSpring}
            >
              <VampirePin
                vampire={p.vampire}
                k={k}
                active={p.index === activeSeat}
                resting={p.resting}
                reduced={Boolean(reduced)}
              />
            </motion.g>
          ));
        })}
      </g>
    </BoardSurface>
  );
}

/** A pin's portrait radius, in board units (× the board scale). */
const PIN_R = 36;

/**
 * A Vampire on the map: the face in a thick ring of its colour, on a short
 * stem pointing down at the space. The acting Vampire pulses; one that has
 * already played this night is dimmed.
 */
function VampirePin({
  vampire,
  k,
  active,
  resting,
  reduced,
}: {
  vampire: number;
  k: number;
  active: boolean;
  resting: boolean;
  reduced: boolean;
}) {
  const R = PIN_R * k;
  const cy = -(R + 14 * k);
  const color = vampireColor(vampire);
  const bust = vampireArt(vampire, "bust");
  const face = vampireFace(vampire);
  const w = R * 2 * 2.3;
  const h = w * 1.25;
  const clip = `pin-face-${vampire}`;
  return (
    <g
      opacity={resting && !active ? 0.72 : 1}
      style={{ filter: `drop-shadow(0 ${3 * k}px ${5 * k}px rgb(0 0 0 / 0.7))` }}
    >
      {active && !reduced && (
        <motion.circle
          cx={0}
          cy={cy}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={4 * k}
          initial={{ r: R + 2 * k, opacity: 0.8 }}
          animate={{ r: R + 18 * k, opacity: 0 }}
          transition={{ duration: 1.6, repeat: Number.POSITIVE_INFINITY, ease: "easeOut" }}
        />
      )}
      {/* The stem. */}
      <path
        d={`M ${-8 * k} ${cy + R - 4 * k} L ${8 * k} ${cy + R - 4 * k} L 0 0 Z`}
        fill={color}
        stroke="#140d18"
        strokeWidth={2 * k}
        strokeLinejoin="round"
      />
      <defs>
        <clipPath id={clip}>
          <circle cx={0} cy={cy} r={R - 3 * k} />
        </clipPath>
      </defs>
      <circle cx={0} cy={cy} r={R + 1.5 * k} fill="#140d18" />
      <circle cx={0} cy={cy} r={R - 1 * k} fill={color} />
      {bust ? (
        <image
          href={bust}
          x={-face.x * w}
          y={cy - face.y * h}
          width={w}
          height={h}
          clipPath={`url(#${clip})`}
          preserveAspectRatio="none"
          style={resting && !active ? { filter: "grayscale(0.5)" } : undefined}
        />
      ) : (
        <text x={0} y={cy + 7 * k} textAnchor="middle" fontSize={20 * k} fill="#fff">
          🦇
        </text>
      )}
      <circle
        cx={0}
        cy={cy}
        r={R - 1.5 * k}
        fill="none"
        stroke={color}
        strokeWidth={(active ? 5 : 4) * k}
      />
      {active && (
        <circle cx={0} cy={cy} r={R + 1.5 * k} fill="none" stroke="#fef3c7" strokeWidth={2 * k} />
      )}
    </g>
  );
}

/**
 * A Chest's state at a glance: face down (the brass back of its token, with a
 * slow golden shimmer — loot waiting), face up (the token and what it gives),
 * or looted (a dim, hollow outline).
 */
function ChestMarker({
  x,
  y,
  k,
  chest,
  reduced,
}: {
  x: number;
  y: number;
  k: number;
  chest: string | null;
  reduced: boolean;
}) {
  const size = 52 * k;
  if (chest === null) {
    return (
      <g pointerEvents="none" opacity={0.5}>
        <title>Looted Chest</title>
        <circle
          cx={x}
          cy={y}
          r={size / 2}
          fill="rgb(20 13 24 / 0.55)"
          stroke="#8b8494"
          strokeWidth={2 * k}
          strokeDasharray={`${4 * k} ${3 * k}`}
        />
        {openIcon && (
          <image
            href={openIcon}
            x={x - size * 0.32}
            y={y - size * 0.32}
            width={size * 0.64}
            height={size * 0.64}
            opacity={0.7}
          />
        )}
      </g>
    );
  }
  if (chest === "hidden") {
    return (
      <g pointerEvents="none">
        <title>Unopened Chest — a face-down Bonus token</title>
        {!reduced && (
          <motion.circle
            cx={x}
            cy={y}
            r={size / 2}
            fill="none"
            stroke="#fcd34d"
            strokeWidth={3 * k}
            animate={{ opacity: [0.15, 0.75, 0.15] }}
            transition={{ duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
          />
        )}
        {tokenBack ? (
          <image
            href={tokenBack}
            x={x - size / 2}
            y={y - size / 2}
            width={size}
            height={size}
            style={{ filter: `drop-shadow(0 ${2 * k}px ${4 * k}px rgb(0 0 0 / 0.7))` }}
          />
        ) : (
          <circle cx={x} cy={y} r={size / 2} fill="#b88a2e" />
        )}
      </g>
    );
  }
  return (
    <g pointerEvents="none">
      <title>
        Open Chest: {bonusName(chest)} — {bonusDef(chest).text}
      </title>
      {tokenFront ? (
        <image
          href={tokenFront}
          x={x - size / 2}
          y={y - size / 2}
          width={size}
          height={size}
          style={{
            filter: `brightness(1.25) drop-shadow(0 0 ${6 * k}px rgb(253 224 71 / 0.75)) drop-shadow(0 ${2 * k}px ${4 * k}px rgb(0 0 0 / 0.7))`,
          }}
        />
      ) : (
        <circle cx={x} cy={y} r={size / 2} fill="#b88a2e" />
      )}
      <text
        x={x}
        y={y + size / 2 + 20 * k}
        textAnchor="middle"
        fontSize={17 * k}
        fontWeight={700}
        fill="#fde68a"
        stroke="#140d18"
        strokeWidth={6 * k}
        paintOrder="stroke"
      >
        {bonusShort(chest)}
      </text>
    </g>
  );
}
