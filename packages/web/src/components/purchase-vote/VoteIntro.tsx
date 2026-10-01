import { VOTES_PER_PLAYER } from "@boardgames/core/protocol";
import { motion } from "framer-motion";
import type { GameDefinition } from "../../games/types";
import { stage } from "../arrivals/arrival-motion";
import { SparkleIcon, UsersIcon } from "../icons";
import { MicroLabel } from "../ui/Label";
import { ModalBody } from "../ui/Modal";
import { StatTile } from "../ui/StatTile";
import { Surface } from "../ui/Surface";
import { seatRange, smallestMaxPlayers, voteTagline } from "./vote-copy";

// The new vote, introduced: why these games (the admin's blurb, set large),
// the four numbers that frame it, and the whole slate as a wall of covers
// with their seat ranges. Page two of the purchase takeover — or page one
// when there is no arrival to show first. A ModalBody: the takeover owns
// the dialog, the header and the footer.

export function VoteIntro({
  title,
  blurb,
  contenders,
  voterCount,
  requiredVoters,
  reduced,
}: {
  title: string | null;
  blurb: string | null;
  contenders: GameDefinition[];
  voterCount: number;
  requiredVoters: number;
  reduced: boolean;
}) {
  const seats = smallestMaxPlayers(contenders);
  const tagline = voteTagline(title);

  return (
    <ModalBody gap="md" className="relative">
      <motion.div
        initial={reduced ? false : "hidden"}
        animate="show"
        variants={stage.rail}
        className="relative flex flex-col gap-4 lg:my-auto lg:gap-6"
      >
        <motion.div
          variants={stage.fadeUp}
          className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-10"
        >
          <div className="flex max-w-3xl flex-col gap-2">
            {tagline && (
              <p className="flex items-center gap-2 text-base font-black tracking-tight text-[var(--accent)] sm:text-2xl">
                <UsersIcon className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" />
                {tagline}
              </p>
            )}
            {blurb && (
              <p className="text-sm leading-relaxed text-fg-primary sm:text-base">{blurb}</p>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2 lg:grid-cols-2 lg:gap-3">
            <Stat value={contenders.length} label="games" />
            <Stat value={seats === null ? "—" : `${seats}+`} label="seats" />
            <Stat value={VOTES_PER_PLAYER} label="votes" />
            <Stat value={`${voterCount}/${requiredVoters}`} label="voted" />
          </div>
        </motion.div>

        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
          {contenders.map((g) => (
            <motion.li key={g.slug} variants={stage.fadeUp}>
              <Contender game={g} />
            </motion.li>
          ))}
        </ul>

        <motion.p
          variants={stage.fadeUp}
          className="flex items-center justify-center gap-2 text-center text-2xs text-fg-muted"
        >
          <SparkleIcon className="h-3 w-3 shrink-0 text-[var(--accent)]" />
          Tallies stay hidden until the vote closes — pick what you'd want on the table, not what's
          winning.
        </motion.p>
      </motion.div>
    </ModalBody>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <StatTile
      variant="tile"
      size="lg"
      label={label}
      value={value}
      className="min-w-0 text-center ring-1 ring-[var(--accent)]/20 lg:min-w-28"
    />
  );
}

/** One cover on the wall: the house-style art, its title and seat range. */
function Contender({ game }: { game: GameDefinition }) {
  const seats = seatRange(game);
  return (
    <Surface
      variant="raised"
      padding="none"
      radius="xl"
      className="group relative overflow-hidden ring-1 ring-line transition hover:ring-[var(--accent)]/50"
    >
      <img
        src={game.thumbnail}
        alt=""
        loading="lazy"
        className="aspect-video w-full object-cover transition duration-500 group-hover:scale-105"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-surface-950/95 via-surface-950/50 to-transparent"
      />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2 sm:p-2.5">
        <p className="line-clamp-2 text-xs font-bold leading-tight text-fg-strong sm:text-sm">
          {game.title}
        </p>
        {seats && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-950/70 px-1.5 py-0.5 ring-1 ring-[var(--accent)]/40 backdrop-blur-sm">
            <UsersIcon className="h-3 w-3 text-[var(--accent)]" />
            <MicroLabel className="text-fg-strong">{seats}</MicroLabel>
          </span>
        )}
      </div>
    </Surface>
  );
}
