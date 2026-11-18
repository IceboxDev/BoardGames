import type { CodenamesPlayerView, Team } from "@boardgames/core/games/codenames/types";
import { MicroLabel, PipMeter } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import {
  hasHumanTeammate,
  seatLabel,
  TEAM_BG,
  TEAM_RING,
  TEAM_TEXT,
  teamName,
} from "../logic/labels";
import { scoreOf } from "../logic/table";
import { RailCard, RailStat, SeatRow, SeatStatus, TeamChat } from "../table";

// The left rail: each team's agents still hidden (as a row of agent pips),
// its roster (who is spymaster, the AI tier, who is thinking, who dropped out
// and who an AI is standing in for), and — only when there is another person
// on the viewer's team to talk to — the team chat.

export function TeamsPanel({
  view,
  names,
  images,
  onChat,
}: {
  view: CodenamesPlayerView;
  names: readonly (string | null)[];
  /** People's profile pictures by seat; null = the role icon. */
  images: readonly (string | null)[];
  onChat: (text: string) => void;
}) {
  const chat = view.team !== null && view.phase !== "over" && hasHumanTeammate(view);
  return (
    <div className="flex min-h-0 flex-col gap-3">
      {scoreOf(view).map(({ team, left, total }) => (
        <TeamCard
          key={team}
          team={team}
          left={left}
          total={total}
          view={view}
          names={names}
          images={images}
        />
      ))}
      {chat && view.team !== null && (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <MicroLabel>{teamName(view.team)} team chat</MicroLabel>
          <TeamChat
            lines={view.chat.map((m) => ({ from: seatLabel(m.seat, names), text: m.text }))}
            onSend={onChat}
            lockedReason={
              view.role === "spymaster"
                ? "Spymasters keep a straight face — you can read, not talk."
                : null
            }
          />
        </div>
      )}
    </div>
  );
}

function TeamCard({
  team,
  left,
  total,
  view,
  names,
  images,
}: {
  team: Team;
  left: number;
  total: number;
  view: CodenamesPlayerView;
  names: readonly (string | null)[];
  images: readonly (string | null)[];
}) {
  const active = view.phase !== "over" && view.currentTeam === team;
  return (
    <RailCard active={active} accentBg={TEAM_BG[team]}>
      <RailStat
        label={
          <>
            <span className={cn("text-sm font-black uppercase tracking-pill", TEAM_TEXT[team])}>
              {teamName(team)}
            </span>
            <span className="text-3xs text-fg-muted">
              {view.team === team ? "Your team" : "Opponents"}
              {team === view.startingTeam && " · went first"}
            </span>
          </>
        }
        value={left}
        unit="to find"
      />
      <PipMeter
        className="mt-2"
        total={total}
        filled={total - left}
        fillClass={TEAM_BG[team]}
        title={`${total - left} of ${total} agents found`}
      />
      <ul className="mt-2.5 flex flex-col gap-1">
        {view.seats
          .filter((s) => s.team === team)
          .map((s) => (
            <SeatRow
              key={s.seat}
              name={seatLabel(s.seat, names)}
              image={images[s.seat] ?? null}
              ai={s.ai}
              tier={s.standIn ? null : s.tier}
              you={s.seat === view.seat}
              marker={s.role === "spymaster" ? { bg: TEAM_BG[team], ring: TEAM_RING[team] } : null}
              away={s.awaySince !== null && !s.standIn}
              status={
                <SeatStatus
                  thinking={view.aiThinking === s.seat}
                  presence={s}
                  idle={s.role === "spymaster" ? "Spymaster" : "Operative"}
                />
              }
            />
          ))}
      </ul>
    </RailCard>
  );
}
