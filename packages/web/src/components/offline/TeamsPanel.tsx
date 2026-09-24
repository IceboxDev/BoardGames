import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { useId, useMemo, useState } from "react";
import type { Attendee } from "../../lib/calendar-games";
import { cn } from "../../lib/cn";
import {
  dealTeams,
  defaultInPool,
  isTeamCandidate,
  loadTeams,
  saveTeams,
  splitCaption,
  type TeamsState,
  teamCountBounds,
} from "../../lib/teams";
import { ChevronLeftIcon, ShuffleIcon } from "../icons";
import { Avatar, Badge, Button, Chip, Eyebrow, Stepper, Surface } from "../ui";
import { TONE_BUBBLE, TONE_RING, type Tone } from "../ui/tones";

// "Make teams" for the night: pick who's playing, pick a team count, deal.
// Local to this phone — the point is to hold it up to the table.

type Props = {
  date: string;
  attendees: Attendee[];
  onBack: () => void;
};

// Full literals so Tailwind sees them; cycles past eight teams.
const TEAM_TONES: readonly { tone: Tone; dot: string }[] = [
  { tone: "sky", dot: "bg-sky-400" },
  { tone: "rose", dot: "bg-rose-400" },
  { tone: "emerald", dot: "bg-emerald-400" },
  { tone: "amber", dot: "bg-amber-400" },
  { tone: "purple", dot: "bg-purple-400" },
  { tone: "cyan", dot: "bg-cyan-400" },
  { tone: "orange", dot: "bg-orange-400" },
  { tone: "accent", dot: "bg-accent-400" },
];

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function TeamsPanel({ date, attendees, onBack }: Props) {
  const reduceMotion = useReducedMotion();
  const poolLabelId = useId();
  const [state, setState] = useState<TeamsState>(() => loadTeams(date));

  const candidates = useMemo(() => attendees.filter(isTeamCandidate), [attendees]);
  const byId = useMemo(() => new Map(candidates.map((a) => [a.userId, a])), [candidates]);

  const poolFor = (overrides: TeamsState["overrides"]) =>
    candidates.filter((a) => overrides[a.userId] ?? defaultInPool(a)).map((a) => a.userId);
  const clampCount = (count: number, poolSize: number) => {
    const { min, max } = teamCountBounds(poolSize);
    return Math.min(max, Math.max(min, count));
  };

  const pool = poolFor(state.overrides);
  const inPool = new Set(pool);
  const bounds = teamCountBounds(pool.length);
  const teamCount = clampCount(state.teamCount, pool.length);

  // People who left the night since the deal drop out of their team.
  const teams = state.teams
    ?.map((team) => team.filter((id) => byId.has(id)))
    .filter((team) => team.length > 0);
  const dealt = teams !== undefined && teams.length > 0;
  const dealtIds = new Set(teams?.flat());
  const stale = dealt && (dealtIds.size !== inPool.size || pool.some((id) => !dealtIds.has(id)));

  const commit = (next: TeamsState) => {
    setState(next);
    saveTeams(date, next);
  };

  const deal = (overrides: TeamsState["overrides"], count: number) => {
    const nextPool = poolFor(overrides);
    const clamped = clampCount(count, nextPool.length);
    commit({
      teamCount: clamped,
      overrides,
      teams: nextPool.length >= 2 ? dealTeams(nextPool, clamped) : null,
    });
  };

  // Pool and count changes re-deal straight away once teams exist — both are
  // deliberate taps, and a stale split on screen would be read as the real one.
  const update = (overrides: TeamsState["overrides"], count: number) => {
    if (dealt) deal(overrides, count);
    else commit({ ...state, overrides, teamCount: count });
  };

  const togglePerson = (a: Attendee) => {
    const next = { ...state.overrides };
    const wantIn = !inPool.has(a.userId);
    if (wantIn === defaultInPool(a)) delete next[a.userId];
    else next[a.userId] = wantIn;
    update(next, state.teamCount);
  };

  const summary = dealt
    ? `Teams dealt: ${teams
        .map((t, i) => `Team ${i + 1} — ${t.map((id) => byId.get(id)?.name ?? "").join(", ")}`)
        .join("; ")}`
    : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 px-1">
        <Button variant="link" size="sm" onClick={onBack} className="-ml-1 gap-1 px-1">
          <ChevronLeftIcon className="h-4 w-4" />
          Attendees
        </Button>
        <Eyebrow tone="sky">Make teams</Eyebrow>
      </div>

      {dealt && (
        <LayoutGroup>
          <div
            className={cn(
              // Two across even on a phone: the whole split has to fit on the screen you hold up.
              "grid grid-cols-2 gap-2",
              teams.length >= 3 && "lg:grid-cols-3",
            )}
          >
            {teams.map((team, i) => {
              const { tone, dot } = TEAM_TONES[i % TEAM_TONES.length];
              return (
                <motion.div
                  // Positional on purpose: Team 1 stays Team 1 across reshuffles, only its members move.
                  // biome-ignore lint/suspicious/noArrayIndexKey: team slots are positional
                  key={`team-${i + 1}`}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduceMotion ? 0 : i * 0.06 }}
                >
                  <Surface
                    variant="raised"
                    padding="none"
                    className={cn("h-full overflow-hidden", TONE_RING[tone])}
                    data-testid="team-card"
                  >
                    <div
                      className={cn(
                        "flex items-center justify-between px-2.5 py-1.5 text-sm font-semibold sm:px-3 sm:py-2",
                        TONE_BUBBLE[tone],
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-full", dot)} />
                        Team {i + 1}
                      </span>
                      <span className="tabular-nums">{team.length}</span>
                    </div>
                    <ul className="flex flex-col gap-0.5 p-1.5 sm:gap-1 sm:p-2">
                      {team.map((id) => {
                        const a = byId.get(id);
                        if (!a) return null;
                        return (
                          <motion.li
                            key={id}
                            layout={!reduceMotion}
                            layoutId={reduceMotion ? undefined : `team-member-${id}`}
                            transition={{ type: "spring", stiffness: 420, damping: 34 }}
                            className="flex min-w-0 items-center gap-2 rounded-full px-1 py-0.5"
                          >
                            <Avatar
                              name={a.name}
                              image={a.image}
                              accentHex={a.accentHex}
                              size="xs"
                            />
                            <span className="min-w-0 truncate text-sm font-medium text-fg-strong">
                              <span className="sm:hidden">{firstName(a.name)}</span>
                              <span className="hidden sm:inline">{a.name}</span>
                            </span>
                            {a.isHost && (
                              <Badge
                                tone="amber"
                                shape="pill"
                                size="xs"
                                className="hidden sm:inline-flex"
                              >
                                Host
                              </Badge>
                            )}
                            {a.isGuest && (
                              <Badge
                                tone="neutral"
                                shape="pill"
                                size="xs"
                                className="hidden sm:inline-flex"
                              >
                                Guest
                              </Badge>
                            )}
                          </motion.li>
                        );
                      })}
                    </ul>
                  </Surface>
                </motion.div>
              );
            })}
          </div>
        </LayoutGroup>
      )}

      <section aria-labelledby={poolLabelId} className="flex flex-col gap-2 px-1">
        <p id={poolLabelId} className="text-xs text-fg-muted">
          <span className="font-semibold text-fg-primary tabular-nums">{pool.length}</span>{" "}
          {pool.length === 1 ? "player" : "players"} · tap to add or remove
        </p>
        <ul className="flex flex-wrap gap-2">
          {candidates.map((a) => {
            const on = inPool.has(a.userId);
            const note =
              a.seat === "waitlisted" ? "waiting" : a.status === "tentative" ? "maybe" : null;
            return (
              <li key={a.userId}>
                <Chip
                  pressed={on}
                  tone="sky"
                  variant="outlined"
                  shape="pill"
                  size="md"
                  onClick={() => togglePerson(a)}
                  className={cn("min-h-10 gap-2 py-1 pr-3 pl-1", !on && "border-dashed")}
                  icon={
                    <Avatar
                      name={a.name}
                      image={a.image}
                      accentHex={a.accentHex}
                      size="xs"
                      className={on ? undefined : "opacity-40 grayscale"}
                    />
                  }
                >
                  <span className="max-w-28 truncate">{firstName(a.name)}</span>
                  {note && <span className="text-3xs text-fg-muted">{note}</span>}
                </Chip>
              </li>
            );
          })}
        </ul>
      </section>

      <Stepper
        size="sm"
        label="Teams"
        value={teamCount}
        min={bounds.min}
        max={bounds.max}
        disabled={pool.length < 2}
        onChange={(count) => update(state.overrides, count)}
        caption={
          pool.length >= 2 ? `teams · ${splitCaption(pool.length, teamCount)}` : "Add at least two"
        }
      />

      <p className="sr-only" aria-live="polite">
        {summary}
      </p>

      <div className="sticky bottom-0 flex flex-col items-center gap-1 bg-gradient-to-t from-surface-900 via-surface-900/90 to-transparent pt-4 pb-1">
        {stale && <p className="text-2xs text-amber-200">Roster changed · reshuffle</p>}
        <Button
          variant="primary"
          size="lg"
          block
          disabled={pool.length < 2}
          onClick={() => deal(state.overrides, teamCount)}
          className="gap-2 sm:w-auto sm:min-w-56"
        >
          <ShuffleIcon className="h-4 w-4" />
          {dealt ? "Reshuffle" : "Shuffle teams"}
        </Button>
      </div>
    </div>
  );
}
