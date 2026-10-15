import type { SevenWondersPlayerView } from "@boardgames/core/games/7-wonders/machine";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "../../../lib/cn";
import { AGE_NUMERAL } from "../card-utils";
import { ageBackArt, artUrl } from "../logic/art";
import { passDirection } from "../logic/table";
import { AGE_TINT } from "../logic/wonder-style";
import SevenIcon from "./SevenIcon";

const TURNS = 6;

/**
 * The top of the left rail on every view: the age, big; six turn pips (a
 * violet seventh while Babylon plays its last card); which way the hands
 * pass; and the discard pile.
 */
export default function AgeTracker({
  view,
  compact = false,
}: {
  view: SevenWondersPlayerView;
  compact?: boolean;
}) {
  const reduced = useReducedMotion();
  const tint = AGE_TINT[view.age];
  const dir = passDirection(view.age);
  const seventh = view.phase === "pending" && view.pending?.kind === "babylon-seventh";
  const over = view.phase === "game-over";
  const turn = Math.min(view.turn, TURNS);

  if (compact) {
    return (
      <span
        className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-card text-sm font-semibold tabular-nums ring-1 ring-line"
        style={{
          background: `linear-gradient(120deg, ${tint.from}66, ${tint.to})`,
          color: tint.ink,
        }}
        title={`Age ${view.age}, turn ${turn} of ${TURNS} — passing ${dir}`}
      >
        {AGE_NUMERAL[view.age]}
        <span className="text-2xs opacity-80">
          {turn}/{TURNS}
        </span>
        <span aria-hidden>{dir === "left" ? "◂" : "▸"}</span>
      </span>
    );
  }

  const back = ageBackArt(view.age);
  const scene = artUrl(over ? "bg-victory" : `bg-age-${view.age}`);

  return (
    <section
      aria-label={`Age ${view.age}, turn ${turn} of ${TURNS}, passing ${dir}`}
      className="relative isolate overflow-hidden rounded-card-xl px-3.5 pb-3 pt-3 shadow-lg ring-1 ring-line"
      style={{ background: `linear-gradient(160deg, ${tint.to}, #0b0a10)` }}
    >
      {scene && (
        <img
          src={scene}
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover opacity-70"
        />
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgb(10 8 6 / 0.15) 0%, rgb(10 8 6 / 0.55) 45%, rgb(10 8 6 / 0.85) 100%), linear-gradient(0deg, rgb(10 8 6 / 0.85), transparent 60%)",
        }}
      />
      <div className="relative flex items-stretch gap-3">
        <motion.div
          key={view.age}
          initial={reduced ? false : { rotateY: 90, opacity: 0 }}
          animate={{ rotateY: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative w-14 shrink-0"
          title={over ? "The game is over" : `Age ${AGE_NUMERAL[view.age]}`}
        >
          {back ? (
            <img
              src={back}
              alt={`Age ${AGE_NUMERAL[view.age]}`}
              draggable={false}
              className="w-full -rotate-3 select-none rounded-ui-md shadow-[0_6px_14px_rgb(0_0_0/0.6)] ring-1 ring-black/50"
              style={{ aspectRatio: "2 / 3" }}
            />
          ) : (
            <span
              className="font-fantasy text-5xl font-bold leading-none text-fg-strong"
              style={{ textShadow: `0 0 18px ${tint.from}` }}
            >
              {AGE_NUMERAL[view.age]}
            </span>
          )}
        </motion.div>
        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div className="flex items-start justify-between gap-2">
            <span className="flex flex-col">
              <span
                className="text-3xs font-semibold uppercase tracking-label"
                style={{ color: tint.ink }}
              >
                {over ? "Final" : "Age"}
              </span>
              <span
                className="font-fantasy text-2xl font-bold leading-none text-fg-strong"
                style={{ textShadow: "0 2px 8px rgb(0 0 0 / 0.8)" }}
              >
                {AGE_NUMERAL[view.age]}
              </span>
            </span>
            <span className="flex flex-col items-end gap-1 pt-0.5">
              <span
                className="flex items-center gap-1 text-2xs font-semibold"
                style={{ color: tint.ink, textShadow: "0 1px 4px rgb(0 0 0 / 0.8)" }}
                title={`Hands pass to the ${dir} this age`}
              >
                {dir === "left" && <Chevron dir="left" reduced={!!reduced} />}
                Pass {dir}
                {dir === "right" && <Chevron dir="right" reduced={!!reduced} />}
              </span>
              <span
                className="flex items-center gap-1 text-2xs tabular-nums text-fg-secondary"
                title="Cards in the discard pile"
              >
                <SevenIcon name="discard" className="h-4 w-4" />
                {view.discardCount}
              </span>
            </span>
          </div>
          <div>
            <div className="flex items-center gap-1" aria-hidden>
              {Array.from({ length: TURNS }, (_, i) => {
                const done = over || i < turn - 1;
                const now = !over && !seventh && i === turn - 1;
                return (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed six pips
                    key={i}
                    className={cn(
                      "h-1.5 flex-1 rounded-full transition-colors",
                      now ? "shadow-glow-amber" : "",
                    )}
                    style={{
                      backgroundColor: now
                        ? "#f5c451"
                        : done
                          ? `${tint.ink}aa`
                          : "rgb(255 255 255 / 0.14)",
                    }}
                  />
                );
              })}
              {seventh && (
                <span
                  className="h-1.5 w-4 rounded-full bg-purple-400 shadow-glow-accent"
                  title="Babylon plays its seventh card"
                />
              )}
            </div>
            <span className="mt-1 block text-3xs tabular-nums text-fg-secondary">
              {over ? "Game over" : seventh ? "Babylon's seventh card" : `Turn ${turn} of ${TURNS}`}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Chevron({ dir, reduced }: { dir: "left" | "right"; reduced: boolean }) {
  return (
    <motion.span
      aria-hidden
      animate={reduced ? undefined : { x: dir === "left" ? [0, -3, 0] : [0, 3, 0] }}
      transition={reduced ? undefined : { duration: 1.4, repeat: Number.POSITIVE_INFINITY }}
    >
      {dir === "left" ? "◂" : "▸"}
    </motion.span>
  );
}
