import type { SevenWondersPlayerBoardView } from "@boardgames/core/games/7-wonders/machine";
import type { Age, WonderStage, WonderStageEffect } from "@boardgames/core/games/7-wonders/types";
import { motion, useReducedMotion } from "framer-motion";
import type { CSSProperties } from "react";
import { Button } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { AGE_NUMERAL, STAGE_NUMERAL } from "../../card-utils";
import { CostIcons, EffectIcons } from "../CardBits";
import SevenIcon from "../SevenIcon";

interface Props {
  player: SevenWondersPlayerBoardView;
  stages: readonly WonderStage[];
  stageAges: readonly Age[];
  buildable: boolean;
  blockedReason?: string;
  onBuild?: () => void;
}

/** Gold-leaf letters, inscribed on the dark foot of the painting. */
const GILT: CSSProperties = {
  color: "#f1cf74",
  textShadow: "0 1px 0 rgb(60 35 5 / 0.9), 0 0 10px rgb(245 196 81 / 0.35)",
};

/** A gold rule between two stages, fading out at both ends. */
const RULE =
  "linear-gradient(180deg, transparent, rgb(241 207 116 / 0.55) 30%, rgb(241 207 116 / 0.55) 70%, transparent)";

/** The buildable stage: gold light breathing up from beneath its inscription. */
const BREATH = [
  "radial-gradient(ellipse 70% 80% at 50% 70%, rgb(245 180 60 / 0.18), transparent 70%)",
  "radial-gradient(ellipse 70% 80% at 50% 70%, rgb(245 180 60 / 0.42), transparent 70%)",
] as const;

/** Wonder powers with no icon of their own: an icon and a caption. */
const SPECIAL: Partial<
  Record<WonderStageEffect["kind"], { icon: "discard" | "cards"; caption: string }>
> = {
  "play-discarded": { icon: "discard", caption: "Build from the discard" },
  "free-first-of-color": { icon: "cards", caption: "First of each colour free" },
  "free-first-of-age": { icon: "cards", caption: "First card of each Age free" },
  "free-last-of-age": { icon: "cards", caption: "Last card of each Age free" },
  "play-seventh-card": { icon: "cards", caption: "Play your seventh card" },
};

interface StageInfo {
  i: number;
  stage: WonderStage;
  built: boolean;
  isNext: boolean;
  live: boolean;
  age: Age | undefined;
}

/**
 * The wonder's stages, inscribed along the dark foot of its painting — no
 * panels, just gold numerals and the stage's terms, divided by gold rules,
 * as if lettered onto the board itself. A built stage glows with gold leaf
 * and names its Age; the one the card in your hand can build breathes gold
 * light and builds on click; the stages after it wait, dimmed.
 */
export default function WonderStages({
  player,
  stages,
  stageAges,
  buildable,
  blockedReason,
  onBuild,
}: Props) {
  const reduced = useReducedMotion();
  const info: StageInfo[] = stages.map((stage, i) => ({
    i,
    stage,
    built: i < player.stagesBuilt,
    isNext: i === player.stagesBuilt,
    live: i === player.stagesBuilt && buildable,
    age: stageAges[i],
  }));

  return (
    <div
      className="relative mt-auto grid px-4 pb-4 pt-8"
      style={{
        gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))`,
        background:
          "linear-gradient(0deg, rgb(8 6 4 / 0.94) 0%, rgb(8 6 4 / 0.8) 55%, transparent 100%)",
      }}
    >
      {info.map((s, k) => {
        const key = `${s.i}-${s.stage.effects.map((e) => e.kind).join(",")}`;
        const body = (
          <div className="relative flex h-full min-h-[4.5rem] w-full">
            {k > 0 && <span aria-hidden className="w-px shrink-0" style={{ background: RULE }} />}
            <div
              className={cn(
                "relative mx-3 flex flex-1 flex-col gap-1",
                !s.built && !s.isNext && "opacity-55",
              )}
            >
              {s.built && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(ellipse at 50% 65%, rgb(241 190 80 / 0.3), transparent 70%)",
                  }}
                />
              )}
              {s.live && (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute -inset-x-2 -inset-y-1"
                  initial={false}
                  animate={{ background: reduced ? BREATH[1] : [BREATH[0], BREATH[1], BREATH[0]] }}
                  transition={
                    reduced
                      ? undefined
                      : { duration: 1.8, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
                  }
                />
              )}
              <StageBody s={s} />
            </div>
          </div>
        );
        if (s.live && onBuild) {
          return (
            <Button
              key={key}
              variant="plain"
              bleed
              onClick={onBuild}
              title={`Build stage ${STAGE_NUMERAL[s.i]} with the selected card (W)`}
              aria-label={`Build wonder stage ${s.i + 1} with the selected card`}
              className="h-full min-w-0 text-left"
            >
              {body}
            </Button>
          );
        }
        return (
          <div
            key={key}
            className="h-full min-w-0"
            title={s.isNext && blockedReason ? blockedReason : s.built ? "Built" : undefined}
          >
            {body}
          </div>
        );
      })}
    </div>
  );
}

/** Numeral, cost (or the Age it was built in) and what the stage gives. */
function StageBody({ s }: { s: StageInfo }) {
  const special = s.stage.effects.flatMap((e) => {
    const sp = SPECIAL[e.kind];
    return sp ? [{ kind: e.kind, ...sp }] : [];
  });
  const plain = s.stage.effects.filter((e) => !SPECIAL[e.kind]);
  return (
    <>
      <div className="relative flex items-center justify-between gap-2">
        <span className="font-fantasy text-xl font-bold leading-none" style={GILT}>
          {STAGE_NUMERAL[s.i]}
        </span>
        {s.built ? (
          <span
            className="flex items-center gap-1 font-fantasy text-3xs font-bold uppercase tracking-label"
            style={GILT}
          >
            <span
              aria-hidden
              className="flex h-4 w-4 items-center justify-center rounded-full text-4xs text-amber-50"
              style={{
                background: "radial-gradient(circle at 35% 30%, #f7d774, #b07a12 70%)",
                boxShadow: "0 1px 2px rgb(60 35 5 / 0.6)",
              }}
            >
              ✓
            </span>
            {s.age ? `Age ${AGE_NUMERAL[s.age]}` : "Built"}
          </span>
        ) : (
          // The cost in a dark well edged with gold, legible over any painting.
          <span
            className="flex min-w-0 items-center rounded-full px-1.5 py-0.5"
            style={{
              background: "rgb(0 0 0 / 0.55)",
              boxShadow: "inset 0 0 0 1px rgb(241 207 116 / 0.3)",
            }}
          >
            <CostIcons cost={s.stage.cost} size="sm" className="flex-wrap justify-end" />
          </span>
        )}
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-0.5">
        {plain.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {plain.map((e, k) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a stage's effects never reorder
              <EffectIcons key={k} effect={e} size="lg" />
            ))}
          </div>
        )}
        {special.map(({ kind, icon, caption }) => (
          <span
            key={kind}
            className="flex items-center gap-1.5 text-center font-fantasy text-xs font-bold leading-tight"
            style={GILT}
          >
            <SevenIcon name={icon} className="h-5 w-5 shrink-0 drop-shadow" />
            {caption}
          </span>
        ))}
      </div>
    </>
  );
}
