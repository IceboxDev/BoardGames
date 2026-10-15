import type { SevenWondersPlayerView } from "@boardgames/core/games/7-wonders/machine";
import type { LogEntry } from "@boardgames/core/games/7-wonders/types";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Button, Modal, ModalBody, ModalFooter } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { AGE_NUMERAL } from "../card-utils";
import { ageBackArt, artUrl } from "../logic/art";
import { passDirection, warBorders } from "../logic/table";
import SevenIcon, { Amount } from "./SevenIcon";
import WonderMedallion from "./WonderMedallion";

type War = Extract<LogEntry, { type: "military" }>;

const AUTO_CLOSE_MS = 9000;

/**
 * The end of an age, shown once as it lands (never for history already on
 * screen at mount): every border's battle in turn, the tokens it paid, and
 * which way the next age passes.
 */
export default function WarReveal({
  view,
  myIndex,
  names,
  force = false,
  onOpenChange,
}: {
  view: SevenWondersPlayerView;
  myIndex: number;
  names: readonly string[];
  /** Dev lab: open on the latest war already in the log. */
  force?: boolean;
  /** Told when a war opens and closes (the final one leads into the results). */
  onOpenChange?: (open: boolean) => void;
}) {
  const reduced = useReducedMotion();
  const wars = view.actionLog.filter((e): e is War => e.type === "military");
  const seen = useRef(force ? Math.max(0, wars.length - 1) : wars.length);
  const [war, setWar] = useState<War | null>(null);

  useEffect(() => {
    if (wars.length <= seen.current) return;
    seen.current = wars.length;
    setWar(wars[wars.length - 1]);
  }, [wars]);

  useEffect(() => {
    onOpenChange?.(war !== null);
  }, [war, onOpenChange]);

  useEffect(() => {
    if (!war) return;
    const t = setTimeout(() => setWar(null), AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [war]);

  if (!war) return null;
  const n = view.playerCount;
  const close = () => setWar(null);
  const rows = warBorders(war.outcomes, n);
  const nextAge = war.age < 3 ? ((war.age + 1) as 2 | 3) : null;
  const label = (seat: number) => (seat === myIndex ? "You" : names[seat]);

  return (
    <Modal
      onClose={close}
      size="lg"
      eyebrow={`End of Age ${AGE_NUMERAL[war.age]}`}
      title="War on every border"
      subheader="Shields are compared with both neighbours"
    >
      <ModalBody>
        {artUrl("bg-war") && (
          <motion.div
            initial={reduced ? false : { opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="relative mb-3 h-36 overflow-hidden rounded-card-lg shadow-lg ring-1 ring-black/60"
          >
            <img
              src={artUrl("bg-war")}
              alt=""
              aria-hidden
              draggable={false}
              className="h-full w-full select-none object-cover"
              style={{ objectPosition: "50% 55%" }}
            />
            <div
              aria-hidden
              className="absolute inset-0"
              style={{ background: "linear-gradient(0deg, rgb(12 8 6 / 0.7), transparent 60%)" }}
            />
            <span
              className="absolute bottom-2 left-3 font-fantasy text-lg font-bold text-amber-100"
              style={{ textShadow: "0 2px 6px rgb(0 0 0 / 0.9)" }}
            >
              Age {AGE_NUMERAL[war.age]} ends in war
            </span>
          </motion.div>
        )}
        <ul className="flex flex-col gap-2 py-1">
          {rows.map((r, i) => (
            <motion.li
              key={`${r.a}-${r.b}`}
              initial={reduced ? false : { opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: reduced ? 0 : 0.15 + i * 0.18 }}
              className={cn(
                "grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-card-lg bg-fill px-3 py-2 ring-1",
                r.a === myIndex || r.b === myIndex ? "ring-accent-400/40" : "ring-line",
              )}
            >
              <Side view={view} seat={r.a} name={label(r.a)} token={r.ta} align="end" />
              <span className="flex items-center gap-1.5 font-bold tabular-nums">
                <span className={r.ta > 0 ? "text-amber-200" : "text-fg-muted"}>
                  {view.players[r.a].shields}
                </span>
                <SevenIcon name="shield" className="h-6 w-6" />
                <span className={r.tb > 0 ? "text-amber-200" : "text-fg-muted"}>
                  {view.players[r.b].shields}
                </span>
              </span>
              <Side view={view} seat={r.b} name={label(r.b)} token={r.tb} align="start" />
            </motion.li>
          ))}
        </ul>
      </ModalBody>
      <ModalFooter
        start={
          <span className="flex items-center gap-2.5">
            {nextAge && ageBackArt(nextAge) && (
              <img
                src={ageBackArt(nextAge)}
                alt=""
                aria-hidden
                draggable={false}
                className="w-8 -rotate-6 select-none rounded-ui-md shadow-md ring-1 ring-black/60"
                style={{ aspectRatio: "2 / 3" }}
              />
            )}
            <span className="text-xs text-fg-secondary">
              {nextAge
                ? `Age ${AGE_NUMERAL[nextAge]} begins — hands pass ${passDirection(nextAge) === "left" ? "◂ left" : "right ▸"}`
                : "The last age is over — time to count"}
            </span>
          </span>
        }
      >
        <Button variant="primary" size="sm" onClick={close}>
          Continue
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function Side({
  view,
  seat,
  name,
  token,
  align,
}: {
  view: SevenWondersPlayerView;
  seat: number;
  name: string;
  token: number;
  align: "start" | "end";
}) {
  const p = view.players[seat];
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-2",
        align === "end" && "flex-row-reverse text-right",
      )}
    >
      <WonderMedallion
        wonderId={p.wonderId}
        side={p.side}
        stagesBuilt={p.stagesBuilt}
        className="h-9 w-9"
      />
      <span className="min-w-0 truncate text-sm font-semibold text-fg-strong">{name}</span>
      {token > 0 ? (
        <Amount kind="victory" value={`+${token}`} className="h-7 w-7" textClass="text-5xs" />
      ) : token < 0 ? (
        <Amount kind="defeat" value="−1" className="h-7 w-7" textClass="text-5xs" />
      ) : (
        <span className="text-2xs text-fg-muted">tie</span>
      )}
    </span>
  );
}
