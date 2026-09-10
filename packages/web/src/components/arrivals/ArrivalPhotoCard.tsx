import { motion } from "framer-motion";
import type { CSSProperties } from "react";
import { cn } from "../../lib/cn";
import { Avatar } from "../ui/Avatar.tsx";
import { Badge } from "../ui/Badge.tsx";
import { BlurUpImage } from "../ui/BlurUpImage.tsx";
import { MicroLabel } from "../ui/Label.tsx";
import { Surface } from "../ui/Surface.tsx";
import { firstName, voteWord } from "./arrival-copy.ts";
import { stage } from "./arrival-motion.ts";
import type { ArrivalCard } from "./arrival-view-model.ts";
import { VoterOrbit } from "./VoterOrbit.tsx";

// One game standing on the shelf: the real photo (portrait 4:5), the vote
// count as a hero number in a frosted disc, the purchaser's medallion
// straddling the photo's bottom edge with the voters' faces in orbit around
// it, then the title and "Bought by". The card takes the game's own accent
// (`--accent`) for its ring, its glow and its badge; the parent takeover
// takes the first game's accent for the panel.
//
// Layout note: the medallion is in normal flow, pulled up over the photo
// with a negative margin, so the plinth's top padding only needs to clear
// the orbit's lower half (radius + face − medallion/2 ≈ 30px).

type ArrivalPhotoCardProps = {
  card: ArrivalCard;
  /** Position in the row — the first photo loads with priority. */
  index: number;
  count: number;
  reduced: boolean;
  className?: string;
};

export function ArrivalPhotoCard({
  card,
  index,
  count,
  reduced,
  className,
}: ArrivalPhotoCardProps) {
  const style = {
    "--accent": card.accentHex,
    boxShadow: "0 0 48px -12px color-mix(in srgb, var(--accent) 45%, transparent)",
  } as CSSProperties;

  return (
    <motion.div variants={stage.card} className={cn("h-full", className)}>
      <Surface
        variant="raised"
        padding="none"
        radius="2xl"
        style={style}
        className="relative flex h-full flex-col overflow-hidden ring-1 ring-[var(--accent)]/30"
      >
        <div className="relative">
          <BlurUpImage
            src={card.photoSrc}
            placeholder={card.placeholder}
            width={card.width}
            height={card.height}
            alt={`${card.title} box`}
            priority={index === 0}
            className="aspect-photo w-full"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-surface-950/90 via-surface-950/35 to-transparent"
          />
          {count > 1 && (
            <div className="absolute left-3 top-3 z-lift">
              <Badge
                shape="pill"
                size="xs"
                className="bg-surface-950/60 text-fg-strong ring-1 ring-[var(--accent)]/50 backdrop-blur-sm"
              >
                New arrival
              </Badge>
            </div>
          )}
          <motion.div
            variants={stage.pop}
            className="absolute right-3 top-3 z-lift flex flex-col items-center rounded-card-lg bg-surface-950/60 px-2.5 py-1.5 backdrop-blur-sm"
          >
            <span className="text-2xl font-black leading-none tabular-nums text-fg-strong sm:text-3xl">
              {card.votes}
            </span>
            <MicroLabel className="mt-0.5 text-fg-secondary">{voteWord(card.votes)}</MicroLabel>
          </motion.div>
        </div>

        <div className="relative z-raised-2 -mt-6 flex justify-center [--orbit-r:42px] md:-mt-8 md:[--orbit-r:50px]">
          <div className="relative">
            <motion.div variants={stage.pop}>
              <Avatar
                name={card.purchaser.name}
                image={card.purchaser.image}
                accentHex={card.purchaser.accentHex ?? card.accentHex}
                size="lg"
                ring
                className="h-12 w-12 text-sm md:h-16 md:w-16 md:text-lg"
              />
            </motion.div>
            <VoterOrbit voters={card.voters} votes={card.votes} spin={!reduced} />
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center px-4 pb-4 pt-9 text-center">
          <motion.h3
            variants={stage.fadeUp}
            className="line-clamp-2 text-base font-black leading-tight text-fg-strong sm:text-lg"
          >
            {card.title}
          </motion.h3>
          <motion.p
            variants={stage.fadeUp}
            className="mt-1.5 flex items-center justify-center gap-1.5"
          >
            <MicroLabel>Bought by</MicroLabel>
            <span className="text-xs font-semibold text-fg-strong">
              {firstName(card.purchaser.name)}
            </span>
          </motion.p>
        </div>
      </Surface>
    </motion.div>
  );
}
