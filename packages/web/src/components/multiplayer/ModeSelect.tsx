import type { ReactNode } from "react";
import type { ExtraMode, SoloMode } from "../../games/types";
import { ComingSoonBadge } from "../game/badges";
import {
  ArrowRightIcon,
  BookIcon,
  CampaignIcon,
  ClockIcon,
  CoachIcon,
  CompanionIcon,
  ScoreSheetIcon,
  SolverIcon,
  TrainerIcon,
  TrophyIcon,
  UserIcon,
  UsersIcon,
} from "../icons";
import { SetupHeader, SetupLayout } from "../setup";
import { Button, type CoreTone, SelectableCard } from "../ui";

// A mode card's whole identity, per kind. The solo card is the game's solo
// group (`SoloMode`), the other its `ExtraMode`; nothing about either
// is per game, so every game showing a kind shows the identical card.
const MODE_CARDS: Record<
  ExtraMode,
  { label: string; icon: ReactNode; tone: CoreTone; description: string }
> = {
  singleplayer: {
    label: "Singleplayer",
    icon: <UserIcon className="h-7 w-7" />,
    tone: "sky",
    description: "Play a game on your own",
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
    description: "Help with a game played at a table or on BGA",
  },
  solver: {
    label: "Solver",
    icon: <SolverIcon className="h-7 w-7" />,
    tone: "accent",
    description: "Analyse a game: odds, proofs and misplays",
  },
  coach: {
    label: "Coach",
    icon: <CoachIcon className="h-7 w-7" />,
    tone: "amber",
    description: "Play the AI with hints and graded moves",
  },
  "score-sheet": {
    label: "Score Sheet",
    icon: <ScoreSheetIcon className="h-7 w-7" />,
    tone: "rose",
    description: "Score a game played at your table",
  },
  campaign: {
    label: "Campaign",
    icon: <CampaignIcon className="h-7 w-7" />,
    tone: "accent",
    description: "Work through scenarios that unlock as you win",
  },
};

const NOT_WIRED = () => {};

/** A mode card the game doesn't offer yet: a real `<button disabled>` (no hover, focus or click) badged "Coming soon". */
function ComingSoonCard({ delay, children }: { delay: number; children: ReactNode }) {
  return (
    <div className="relative grid">
      {children}
      <div
        className="animate-card-fade-up absolute top-3 right-3"
        style={{ animationDelay: `${delay}ms` }}
      >
        <ComingSoonBadge />
      </div>
    </div>
  );
}

interface ModeSelectProps {
  title: string;
  soloMode: SoloMode;
  /** The mode beside `soloMode`. */
  extraMode: ExtraMode;
  /** Opens the extra mode; absent = not wired yet (disabled, badged "Coming soon"). */
  onExtra?: () => void;
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
  extraMode,
  onExtra,
  onSolo,
  onMultiplayer,
  multiplayerComingSoon = false,
  onRules,
  onMatchHistory,
  onTournament,
}: ModeSelectProps) {
  const solo = MODE_CARDS[soloMode];
  const extra = MODE_CARDS[extraMode];

  const soloCard = (delay: number) => (
    <SelectableCard
      tone={solo.tone}
      icon={solo.icon}
      title={solo.label}
      description={solo.description}
      onClick={onSolo}
      animationDelay={delay}
    />
  );
  const extraCard = (delay: number) =>
    onExtra ? (
      <SelectableCard
        tone={extra.tone}
        icon={extra.icon}
        title={extra.label}
        description={extra.description}
        onClick={onExtra}
        animationDelay={delay}
      />
    ) : (
      <ComingSoonCard delay={delay}>
        <SelectableCard
          tone={extra.tone}
          icon={extra.icon}
          title={extra.label}
          description={extra.description}
          onClick={NOT_WIRED}
          disabled
          animationDelay={delay}
        />
      </ComingSoonCard>
    );

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

      {/* Primary actions, always [other mode, Singleplayer, Multiplayer]: a
          game whose solo group is Trainer / Companion / Solver shows that first
          and Singleplayer (its extra mode) in the middle. */}
      <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-5 sm:grid-cols-3">
        {soloMode === "singleplayer" ? (
          <>
            {extraCard(0)}
            {soloCard(60)}
          </>
        ) : (
          <>
            {soloCard(0)}
            {extraCard(60)}
          </>
        )}
        {/* One Multiplayer card for every game; disabled while the game has no rooms. */}
        {multiplayerComingSoon ? (
          <ComingSoonCard delay={120}>
            <MultiplayerCard onClick={onMultiplayer} disabled />
          </ComingSoonCard>
        ) : (
          <MultiplayerCard onClick={onMultiplayer} />
        )}
      </div>

      {/* Secondary actions — separated with breathing room */}
      <div className="mx-auto mt-10 w-full max-w-3xl">
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
            animationDelay={180}
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
              animationDelay={240}
            />
          )}
        </div>
      </div>
    </SetupLayout>
  );
}

function MultiplayerCard({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <SelectableCard
      tone="emerald"
      icon={<UsersIcon className="h-7 w-7" />}
      title="Multiplayer"
      description="Create a room and play online with friends"
      onClick={onClick}
      disabled={disabled}
      animationDelay={120}
    />
  );
}
