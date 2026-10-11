import type { ReactNode } from "react";
import type { SoloMode } from "../../games/types";
import { ComingSoonBadge } from "../game/badges";
import {
  ArrowRightIcon,
  BookIcon,
  BotIcon,
  ClockIcon,
  CompanionIcon,
  SolverIcon,
  TrainerIcon,
  TrophyIcon,
  UsersIcon,
} from "../icons";
import { SetupHeader, SetupLayout } from "../setup";
import { Button, type CoreTone, SelectableCard } from "../ui";

// The left card's whole identity, per solo group (`SoloMode`). Nothing about
// it is per game, so every game in a group shows the identical card.
const SOLO_MODES: Record<
  SoloMode,
  { label: string; icon: ReactNode; tone: CoreTone; description: string }
> = {
  ai: {
    label: "Play vs AI",
    icon: <BotIcon className="h-7 w-7" />,
    tone: "sky",
    description: "Computer players take the other seats",
  },
  trainer: {
    label: "Trainer",
    icon: <TrainerIcon className="h-7 w-7" />,
    tone: "amber",
    description: "Practice on your own and sharpen your skills",
  },
  companion: {
    label: "Companion",
    icon: <CompanionIcon className="h-7 w-7" />,
    tone: "rose",
    description: "Run the physical game at your table",
  },
  solver: {
    label: "Solver",
    icon: <SolverIcon className="h-7 w-7" />,
    tone: "accent",
    description: "Analyse a game: odds, proofs and misplays",
  },
};

interface ModeSelectProps {
  title: string;
  soloMode: SoloMode;
  onSolo: () => void;
  onMultiplayer: () => void;
  /** No online rooms yet: the same Multiplayer card, inert and greyed, badged "Coming soon". */
  multiplayerComingSoon?: boolean;
  onRules?: () => void;
  onMatchHistory: () => void;
  onTournament?: () => void;
}

export function ModeSelect({
  title,
  soloMode,
  onSolo,
  onMultiplayer,
  multiplayerComingSoon = false,
  onRules,
  onMatchHistory,
  onTournament,
}: ModeSelectProps) {
  const solo = SOLO_MODES[soloMode];

  return (
    <SetupLayout>
      <SetupHeader title={title} />

      {onRules && (
        <Button
          variant="secondary"
          size="xs"
          shape="pill"
          onClick={onRules}
          className="animate-card-fade-up -mt-6 mb-8 hover:border-amber-400/40 hover:text-amber-300"
        >
          <BookIcon className="h-3.5 w-3.5" />
          How to Play
        </Button>
      )}

      {/* Primary actions — generous spacing */}
      <div className="mx-auto grid w-full max-w-xl grid-cols-1 gap-5 sm:grid-cols-2">
        <SelectableCard
          tone={solo.tone}
          icon={solo.icon}
          title={solo.label}
          description={solo.description}
          onClick={onSolo}
          animationDelay={0}
        />
        {/* One Multiplayer card for every game; a game without rooms gets the
            same card disabled (a real <button disabled>, so no hover, no
            focus, no click) with a badge saying why. */}
        <div className="relative grid">
          <SelectableCard
            tone="emerald"
            icon={<UsersIcon className="h-7 w-7" />}
            title="Multiplayer"
            description="Create a room and play online with friends"
            onClick={onMultiplayer}
            disabled={multiplayerComingSoon}
            animationDelay={60}
          />
          {multiplayerComingSoon && (
            <div
              className="animate-card-fade-up absolute top-3 right-3"
              style={{ animationDelay: "60ms" }}
            >
              <ComingSoonBadge />
            </div>
          )}
        </div>
      </div>

      {/* Secondary actions — separated with breathing room */}
      <div className="mx-auto mt-10 w-full max-w-xl">
        <div className="mb-4 h-px bg-gradient-to-r from-transparent via-line to-transparent" />
        <div className={`grid w-full grid-cols-1 gap-3 ${onTournament ? "sm:grid-cols-2" : ""}`}>
          <SelectableCard
            orientation="horizontal"
            tone="emerald"
            icon={<ClockIcon className="h-4 w-4" />}
            title="Match History"
            description="Review your past games"
            trailing={<ArrowRightIcon className="h-4 w-4" />}
            onClick={onMatchHistory}
            animationDelay={120}
          />
          {onTournament && (
            <SelectableCard
              orientation="horizontal"
              tone="accent"
              icon={<TrophyIcon className="h-4 w-4" />}
              title="AI Tournament"
              description="Watch AI strategies battle each other"
              trailing={<ArrowRightIcon className="h-4 w-4" />}
              onClick={onTournament}
              animationDelay={180}
            />
          )}
        </div>
      </div>
    </SetupLayout>
  );
}
