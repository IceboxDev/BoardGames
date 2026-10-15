import type { SevenWondersPlayerView } from "@boardgames/core/games/7-wonders/machine";
import type { SevenWondersAction } from "@boardgames/core/games/7-wonders/types";
import { getWonderDef } from "@boardgames/core/games/7-wonders/wonders";
import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { cn } from "../../../lib/cn";
import { effectSentence, STAGE_NUMERAL } from "../card-utils";
import { seatLabels, seatsFrom } from "../logic/table";
import { CostIcons, EffectIcons } from "./CardBits";
import ChoiceOverlay from "./ChoiceOverlay";
import WonderBoard from "./city/WonderBoard";
import WonderMedallion from "./WonderMedallion";

interface Props {
  view: SevenWondersPlayerView;
  myIndex: number;
  seatNames: readonly string[];
  onAction: (action: SevenWondersAction) => void;
}

/** Powers whose icon carries its own label — the sentence beside it says it once. */
const WORDS_ONLY = new Set([
  "play-discarded",
  "free-first-of-color",
  "free-first-of-age",
  "free-last-of-age",
  "play-seventh-card",
]);

const SIDES = [
  { side: "A", title: "Day", glyph: "☀", tone: "#fcd34d" },
  { side: "B", title: "Night", glyph: "☾", tone: "#a5b4fc" },
] as const;

/**
 * Before Age I, as at the table: the game is already on screen, and over it
 * you turn the board you were dealt to Day or Night. Both sides are laid out
 * in full — the painting, every stage's cost and reward in words — and the
 * board can be peeked at (every city's wonder is there) before choosing.
 * The picks are revealed together once every seat has chosen.
 */
export default function SidePicker({ view, myIndex, seatNames, onAction }: Props) {
  const reduced = useReducedMotion();
  const me = view.players[myIndex];
  const [picked, setPicked] = useState<"A" | "B" | null>(null);
  const waiting = view.me?.hasSelected ?? false;
  if (!me) return null;
  const def = getWonderDef(me.wonderId);
  const names = seatLabels(
    view.players.map((p) => p.wonderId),
    myIndex,
    seatNames,
  );

  const choose = (side: "A" | "B") => {
    if (waiting) return;
    setPicked(side);
    onAction({ type: "choose-side", side });
  };

  const seats = (
    <ul className="flex w-full flex-wrap items-center justify-center gap-2">
      {seatsFrom(myIndex, view.playerCount).map((seat) => {
        const p = view.players[seat];
        const ready = p.hasSelected;
        return (
          <li
            key={seat}
            className="flex items-center gap-2 rounded-full bg-surface-900/80 py-1 pl-1 pr-3 ring-1 ring-line"
          >
            <WonderMedallion wonderId={p.wonderId} side="A" stagesBuilt={0} className="h-7 w-7" />
            <span className="text-xs font-semibold text-fg-primary">{names[seat]}</span>
            <span
              className={cn(
                "text-2xs font-semibold",
                ready ? "text-emerald-300" : "text-amber-200/80",
              )}
            >
              {ready ? "✓ ready" : "choosing…"}
            </span>
          </li>
        );
      })}
    </ul>
  );

  return (
    <ChoiceOverlay
      eyebrow="Before Age Ⅰ · choose your side"
      title={def.name}
      subtitle="Turn your board to Day or Night. Everyone chooses at once — the sides are revealed together when the last player has picked."
      returnLabel="Back to choosing a side"
      className="max-w-6xl"
      footer={seats}
    >
      <div className="grid w-full gap-5 lg:grid-cols-2">
        {SIDES.map(({ side, title, glyph, tone }, k) => {
          const stages = def.sides[side].stages;
          const vp = stages
            .flatMap((s) => s.effects)
            .reduce((n, e) => n + (e.kind === "points" ? e.amount : 0), 0);
          const chosen = picked === side;
          const other = picked !== null && !chosen;
          return (
            <motion.button
              key={side}
              type="button"
              onClick={() => choose(side)}
              disabled={waiting}
              aria-pressed={chosen}
              aria-label={`${title} side (${side}) of ${def.name}`}
              initial={reduced ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: other ? 0.45 : 1, y: 0 }}
              transition={{ delay: reduced ? 0 : 0.08 + k * 0.08, duration: 0.35 }}
              className={cn(
                "group flex flex-col overflow-hidden rounded-card-2xl bg-surface-900/90 text-left shadow-2xl ring-1 ring-black/60 transition-[transform,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
                !waiting && "hover:-translate-y-1 hover:shadow-glow-amber",
                chosen && "ring-2 ring-amber-300 shadow-glow-amber",
                other && "saturate-50",
              )}
            >
              <WonderBoard
                player={{ ...me, side, stagesBuilt: 0 }}
                className="h-56 w-full rounded-none ring-0 shadow-none"
              />
              <div className="flex flex-1 flex-col gap-3 px-5 pb-5 pt-4">
                <div className="flex items-center gap-3">
                  <span
                    className="flex items-center gap-1.5 font-fantasy text-xl font-bold"
                    style={{ color: tone }}
                  >
                    <span aria-hidden>{glyph}</span>
                    {title}
                    <span className="text-sm font-semibold text-fg-muted">· {side}</span>
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-2 text-2xs font-semibold text-fg-secondary">
                    <span className="rounded-full bg-fill px-2 py-0.5 ring-1 ring-line">
                      {stages.length} stages
                    </span>
                    {vp > 0 && (
                      <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-amber-200 ring-1 ring-amber-300/30">
                        {vp} VP built in
                      </span>
                    )}
                  </span>
                </div>
                <ol className="flex flex-col divide-y divide-line-soft rounded-card-lg bg-surface-950/60 ring-1 ring-line-soft">
                  {stages.map((stage, i) => (
                    <li
                      // biome-ignore lint/suspicious/noArrayIndexKey: a side's stages never reorder
                      key={i}
                      className="grid grid-cols-[1.75rem_6.5rem_1fr] items-center gap-2 px-3 py-2"
                    >
                      <span className="font-fantasy text-base font-bold text-amber-200/90">
                        {STAGE_NUMERAL[i]}
                      </span>
                      <CostIcons cost={stage.cost} size="xs" className="flex-wrap" />
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="flex shrink-0 items-center gap-1">
                          {stage.effects
                            .filter((e) => !WORDS_ONLY.has(e.kind))
                            .map((e, j) => (
                              // biome-ignore lint/suspicious/noArrayIndexKey: a stage's effects never reorder
                              <EffectIcons key={j} effect={e} size="sm" />
                            ))}
                        </span>
                        <span className="min-w-0 text-xs leading-snug text-fg-secondary">
                          {stage.effects.map(effectSentence).join(" · ")}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
                <span
                  className={cn(
                    "mt-auto self-center rounded-full px-5 py-2 text-sm font-semibold transition-colors",
                    chosen
                      ? "bg-amber-300 text-surface-950"
                      : "bg-fill text-fg-primary ring-1 ring-line group-hover:bg-amber-300/15 group-hover:text-amber-100",
                  )}
                >
                  {chosen ? `✓ ${title} side chosen` : `Play the ${title} side`}
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </ChoiceOverlay>
  );
}
