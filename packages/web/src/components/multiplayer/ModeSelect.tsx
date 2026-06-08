import type { ReactNode } from "react";
import {
  ArrowRightIcon,
  BookIcon,
  BotIcon,
  ClockIcon,
  TrainerIcon,
  TrophyIcon,
  UserIcon,
  UsersIcon,
} from "../icons";
import { SetupHeader, SetupLayout } from "../setup";
import { Button, type SegmentedTone, SelectableCard } from "../ui";

interface ModeSelectProps {
  title: string;
  subtitle?: string;
  soloLabel?: string;
  onRules?: () => void;
  onSolo?: () => void;
  onMultiplayer: () => void;
  onMatchHistory?: () => void;
  onTournament?: () => void;
}

// Per-solo-label identity, routed through the design-system tone scale. This
// replaces the old 8-field per-label style bag + raw violet/blue/amber classes
// — the visual difference between Solo / Trainer / Play-vs-AI is now just a
// `tone` and an icon.
function soloMode(label: string): { icon: ReactNode; tone: SegmentedTone; description: string } {
  switch (label) {
    case "Solo":
      return {
        icon: <UserIcon className="h-7 w-7" />,
        tone: "accent",
        description: "Control all players yourself",
      };
    case "Trainer":
      return {
        icon: <TrainerIcon className="h-7 w-7" />,
        tone: "amber",
        description: "Practice and sharpen your skills",
      };
    default:
      return {
        icon: <BotIcon className="h-7 w-7" />,
        tone: "sky",
        description: "Challenge a computer opponent",
      };
  }
}

export function ModeSelect({
  title,
  subtitle,
  soloLabel = "Play vs AI",
  onRules,
  onSolo,
  onMultiplayer,
  onMatchHistory,
  onTournament,
}: ModeSelectProps) {
  const solo = soloMode(soloLabel);

  return (
    <SetupLayout>
      <SetupHeader title={title} subtitle={subtitle} />

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
      <div
        className={`mx-auto grid w-full max-w-xl grid-cols-1 gap-5 ${onSolo ? "sm:grid-cols-2" : "max-w-xs"}`}
      >
        {onSolo && (
          <SelectableCard
            tone={solo.tone}
            icon={solo.icon}
            title={soloLabel}
            description={solo.description}
            onClick={onSolo}
            animationDelay={0}
          />
        )}
        <SelectableCard
          tone="emerald"
          icon={<UsersIcon className="h-7 w-7" />}
          title="Multiplayer"
          description="Create a room and play online with friends"
          onClick={onMultiplayer}
          animationDelay={60}
        />
      </div>

      {/* Secondary actions — separated with breathing room */}
      {(onMatchHistory || onTournament) && (
        <div className="mx-auto mt-10 w-full max-w-xl">
          <div className="mb-4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <div
            className={`grid w-full grid-cols-1 gap-3 ${onMatchHistory && onTournament ? "sm:grid-cols-2" : ""}`}
          >
            {onMatchHistory && (
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
            )}
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
      )}
    </SetupLayout>
  );
}
