import type { CodenamesPlayerView, Team } from "@boardgames/core/games/codenames/types";
import { BotIcon, UserIcon } from "../../../components/icons";
import { MicroLabel } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { hasHumanTeammate, seatLabel, TEAM_BG, TEAM_TEXT, teamName } from "../logic/labels";
import { TeamChat } from "./TeamChat";

// The left rail: each team's agents still hidden (as a row of agent pips),
// its roster (who is spymaster, who is thinking), and — only when there is
// another person on the viewer's team to talk to — the team chat.

export function TeamsPanel({
  view,
  names,
  onChat,
}: {
  view: CodenamesPlayerView;
  names: readonly (string | null)[];
  onChat: (text: string) => void;
}) {
  const chat = view.team !== null && view.phase !== "over" && hasHumanTeammate(view);
  return (
    <div className="flex min-h-0 flex-col gap-3">
      {([view.startingTeam, (1 - view.startingTeam) as Team] as const).map((team) => (
        <TeamCard key={team} team={team} view={view} names={names} />
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
  view,
  names,
}: {
  team: Team;
  view: CodenamesPlayerView;
  names: readonly (string | null)[];
}) {
  const active = view.phase !== "over" && view.currentTeam === team;
  const total = team === view.startingTeam ? 9 : 8;
  const left = view.agentsLeft[team];
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-card-lg border p-3 transition-colors",
        active ? "border-line-strong bg-fill" : "border-line-soft bg-fill-soft",
      )}
    >
      {active && (
        <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", TEAM_BG[team])} />
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className={cn("text-sm font-black uppercase tracking-pill", TEAM_TEXT[team])}>
            {teamName(team)}
          </span>
          <span className="text-3xs text-fg-muted">
            {view.team === team ? "Your team" : "Opponents"}
            {team === view.startingTeam && " · went first"}
          </span>
        </div>
        <span className="flex items-baseline gap-1">
          <span className="text-3xl font-black tabular-nums leading-none text-fg-strong">
            {left}
          </span>
          <span className="text-3xs text-fg-muted">to find</span>
        </span>
      </div>

      <div className="mt-2 flex gap-1" title={`${total - left} of ${total} agents found`}>
        {Array.from({ length: total }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: pips are positional
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i < total - left ? TEAM_BG[team] : "bg-fill-strong",
            )}
          />
        ))}
      </div>

      <ul className="mt-2.5 flex flex-col gap-1">
        {view.seats
          .filter((s) => s.team === team)
          .map((s) => (
            <li key={s.seat} className="flex items-center gap-2 text-xs">
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                  s.role === "spymaster"
                    ? cn(TEAM_BG[team], "text-cn-cover-ink")
                    : "bg-fill-strong text-fg-secondary",
                  s.seat === view.seat && "ring-2 ring-accent-400",
                )}
                title={s.seat === view.seat ? "You" : undefined}
              >
                {s.ai ? <BotIcon className="h-3 w-3" /> : <UserIcon className="h-3 w-3" />}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  s.seat === view.seat ? "font-bold text-fg-strong" : "text-fg-secondary",
                )}
              >
                {seatLabel(s.seat, names)}
              </span>
              {view.aiThinking === s.seat ? (
                <span className="flex shrink-0 gap-0.5" title="Thinking…">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1 w-1 animate-bounce rounded-full bg-amber-300"
                      style={{ animationDelay: `${i * 140}ms` }}
                    />
                  ))}
                </span>
              ) : (
                <span className="shrink-0 text-3xs text-fg-muted">
                  {s.role === "spymaster" ? "Spymaster" : "Operative"}
                </span>
              )}
            </li>
          ))}
      </ul>
    </section>
  );
}
