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
                {EFFECT_GLYPH[s.effect] && (
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
            {(s.effect === "chest" || s.effect === "chest-open") &&
              chest !== undefined &&
              (chest && chest !== "hidden" ? (
                // An open Chest shows its token — public information.
                <g pointerEvents="none">
                  <title>
                    Open Chest: {bonusName(chest)} — {bonusDef(chest).text}
                  </title>
                  <text
                    x={s.x}
                    y={s.y - r - 10 * k}
                    textAnchor="middle"
                    fontSize={20 * k}
                    fontWeight={700}
                    fill="#fde68a"
                    stroke="#140d18"
                    strokeWidth={5 * k}
                    paintOrder="stroke"
                  >
                    {bonusShort(chest)}
                  </text>
                </g>
              ) : (
                badge(chest ? "?" : "○", chest ? "#fcd34d" : "#6b6475")
              ))}
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

      <g pointerEvents="none">
        {[...stacks.entries()].flatMap(([spaceId, stack]) => {
          const s = byId.get(spaceId);
          if (!s) return [];
          return stack.map((p, i) => (
            <motion.g
              key={`vamp-${p.index}`}
              initial={false}
              animate={{ x: s.x + k * (18 + i * 9), y: s.y + k * (16 - i * 14) }}
              transition={reduced ? { duration: 0 } : boardSpring}
            >
              <circle
                r={17 * k}
                fill={vampireColor(p.vampire)}
                stroke={p.index === activeSeat ? "#fef3c7" : "#1b1022"}
                strokeWidth={(p.index === activeSeat ? 5 : 3) * k}
                opacity={p.resting ? 0.55 : 1}
              />
              <text y={6 * k} textAnchor="middle" fontSize={17 * k} fill="#fff" fontWeight={700}>
                {p.resting ? "z" : "🦇"}
              </text>
            </motion.g>
          ));
        })}
      </g>
    </BoardSurface>
  );
}
