import type { ProfileStats } from "@boardgames/core/protocol";
import type { ReactNode } from "react";
import {
  BookIcon,
  CheckIcon,
  FlameIcon,
  GalleryIcon,
  HostIcon,
  SparkleIcon,
  StackIcon,
  StarIcon,
  TrophyIcon,
  UsersIcon,
} from "../icons";

// Achievement badges, derived entirely from the public `ProfileStats` (no stored
// data). Every badge is shown — earned ones in full color, not-yet-earned ones
// muted — with a one-line description of the criterion so each is self
// explanatory. Rendered as its own "Achievements" section on the profile.

type BadgeTone = "accent" | "amber" | "emerald" | "sky";

type BadgeDef = {
  key: string;
  label: string;
  /** Plain-language criterion, shown on the card so the badge explains itself. */
  description: string;
  tone: BadgeTone;
  icon: ReactNode;
  earned: (s: ProfileStats) => boolean;
};

const ICON = "h-4 w-4";

// Ordered as loose tiers (owning · playing · winning · variety · attendance) so
// a fuller profile lights up roughly left-to-right, top-to-bottom.
const BADGES: BadgeDef[] = [
  {
    key: "collector",
    label: "Collector",
    description: "Owns 10+ games",
    tone: "accent",
    icon: <StackIcon className={ICON} />,
    earned: (s) => s.gamesOwned >= 10,
  },
  {
    key: "curator",
    label: "Curator",
    description: "Owns 25+ games",
    tone: "accent",
    icon: <BookIcon className={ICON} />,
    earned: (s) => s.gamesOwned >= 25,
  },
  {
    key: "veteran",
    label: "Veteran",
    description: "Played 50+ games",
    tone: "amber",
    icon: <TrophyIcon className={ICON} />,
    earned: (s) => s.gamesPlayed >= 50,
  },
  {
    key: "centurion",
    label: "Centurion",
    description: "Played 100+ games",
    tone: "amber",
    icon: <SparkleIcon className={ICON} />,
    earned: (s) => s.gamesPlayed >= 100,
  },
  {
    key: "sharpshooter",
    label: "Sharpshooter",
    description: "60%+ wins (10+ games)",
    tone: "emerald",
    icon: <StarIcon className={ICON} />,
    earned: (s) => s.winRate !== null && s.winRate >= 0.6 && s.wins + s.losses >= 10,
  },
  {
    key: "champion",
    label: "Champion",
    description: "Won 25+ games",
    tone: "emerald",
    icon: <TrophyIcon className={ICON} />,
    earned: (s) => s.wins >= 25,
  },
  {
    key: "generalist",
    label: "Generalist",
    description: "8+ different games",
    tone: "sky",
    icon: <GalleryIcon className={ICON} />,
    earned: (s) => s.distinctGames >= 8,
  },
  {
    key: "specialist",
    label: "Specialist",
    description: "One game 12+ times",
    tone: "sky",
    icon: <FlameIcon className={ICON} />,
    earned: (s) => (s.perGame[0]?.plays ?? 0) >= 12,
  },
  {
    key: "regular",
    label: "Regular",
    description: "5+ game nights",
    tone: "accent",
    icon: <UsersIcon className={ICON} />,
    earned: (s) => s.nightsAttended >= 5,
  },
  {
    key: "mainstay",
    label: "Mainstay",
    description: "15+ game nights",
    tone: "accent",
    icon: <HostIcon className={ICON} />,
    earned: (s) => s.nightsAttended >= 15,
  },
];

const TONE: Record<BadgeTone, { bubble: string; card: string; name: string }> = {
  accent: {
    bubble: "bg-accent-500/15 text-accent-300",
    card: "border-accent-400/30 bg-accent-500/[0.06]",
    name: "text-accent-100",
  },
  amber: {
    bubble: "bg-amber-500/15 text-amber-300",
    card: "border-amber-400/30 bg-amber-500/[0.06]",
    name: "text-amber-100",
  },
  emerald: {
    bubble: "bg-emerald-500/15 text-emerald-300",
    card: "border-emerald-400/30 bg-emerald-500/[0.06]",
    name: "text-emerald-100",
  },
  sky: {
    bubble: "bg-sky-500/15 text-sky-300",
    card: "border-sky-400/30 bg-sky-500/[0.06]",
    name: "text-sky-100",
  },
};

const LOCKED_CARD = "border-white/[0.06] bg-surface-900/40";
const LOCKED_BUBBLE = "bg-surface-800 text-fg-disabled";

type ProfileBadgesProps = {
  stats: ProfileStats;
  /** First name, for the "no badges yet" hint on an empty profile. */
  firstName?: string;
};

export function ProfileBadges({ stats, firstName }: ProfileBadgesProps) {
  const earnedCount = BADGES.filter((b) => b.earned(stats)).length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-fg-muted">
        {earnedCount > 0 ? (
          <>
            <span className="font-semibold text-fg-secondary">{earnedCount}</span> of{" "}
            {BADGES.length} earned
          </>
        ) : (
          `No badges yet — ${firstName ?? "this player"} can earn ${BADGES.length} of them.`
        )}
      </p>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {BADGES.map((badge) => {
          const earned = badge.earned(stats);
          const tone = TONE[badge.tone];
          return (
            <li
              key={badge.key}
              className={`relative flex flex-col items-center gap-1.5 rounded-xl border px-2.5 py-3 text-center transition ${
                earned ? tone.card : LOCKED_CARD
              }`}
            >
              {earned && (
                <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                  <CheckIcon className="h-2.5 w-2.5" />
                </span>
              )}
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  earned ? tone.bubble : LOCKED_BUBBLE
                }`}
              >
                {badge.icon}
              </span>
              <span className={`text-xs font-bold ${earned ? tone.name : "text-fg-secondary"}`}>
                {badge.label}
              </span>
              <span className="text-3xs leading-tight text-fg-muted">{badge.description}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
