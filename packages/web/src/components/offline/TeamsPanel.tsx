import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { useId, useMemo, useRef, useState } from "react";
import { games } from "../../games/registry";
import type { Attendee } from "../../lib/calendar-games";
import { cn } from "../../lib/cn";
import { balanceTeams } from "../../lib/skills";
import {
  dealTeams,
  defaultInPool,
  isTeamCandidate,
  loadTeams,
  newSeed,
  saveTeams,
  splitCaption,
  type TeamsMode,
  type TeamsState,
  teamCountBounds,
} from "../../lib/teams";
import { ChevronLeftIcon, ShuffleIcon, SparkleIcon } from "../icons";
import { Avatar, Badge, Button, Chip, Eyebrow, SegmentedControl, Stepper, Surface } from "../ui";
import { TONE_BUBBLE, TONE_RING, type Tone } from "../ui/tones";
import { TeamGamePicker } from "./TeamGamePicker";
import { TeamOdds } from "./TeamOdds";

// "Make teams" for the night: pick the game, who's playing and how many
// teams, then deal. BALANCED asks the server for the fairest split for that
// game — the rating engine weighs each player by the traits the game asks
// for plus their own record in it — and shows the win chances; RANDOM just
// shuffles. Local to this phone: the point is to hold it up to the table.

type Props = {
  date: string;
  attendees: Attendee[];
  /** Tonight's lineup, best first — the picker's strip. */
  lineup?: readonly string[];
  onBack: () => void;
  /** The balance request — the dev preview swaps in a local one. */
  balancer?: typeof balanceTeams;
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
const FILLS = TEAM_TONES.map((t) => t.dot);

const NO_LINEUP: readonly string[] = [];
const TITLE_BY_SLUG = new Map(games.map((g) => [g.slug, g.title]));
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const listNames = (names: string[]) =>
  names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

type DealInput = {
  overrides: TeamsState["overrides"];
  count: number;
  mode: TeamsMode;
  slug: string | null;
};

export function TeamsPanel({
  date,
  attendees,
  lineup = NO_LINEUP,
  onBack,
  balancer = balanceTeams,
}: Props) {
  const reduceMotion = useReducedMotion();
  const poolLabelId = useId();
  const [state, setState] = useState<TeamsState>(() => loadTeams(date));
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Only the latest deal may land: a tap on the pool while a balance is in
  // flight must not be overwritten by the older answer.
  const dealNo = useRef(0);

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
  // The game defaults to tonight's top pick until one is chosen.
  const slug = state.slug ?? lineup.find((s) => TITLE_BY_SLUG.has(s)) ?? null;
  const gameTitle = slug ? (TITLE_BY_SLUG.get(slug) ?? null) : null;
  const balanced = state.mode === "balanced";

  // People who left the night since the deal drop out of their team.
  const teams = state.teams
    ?.map((team) => team.filter((id) => byId.has(id)))
    .filter((team) => team.length > 0);
  const dealt = teams !== undefined && teams.length > 0;
  const dealtIds = new Set(teams?.flat());
  const stale = dealt && (dealtIds.size !== inPool.size || pool.some((id) => !dealtIds.has(id)));
  // Chances describe the split as dealt; a roster change voids them.
  const chances =
    dealt && !stale && state.chances && state.chances.length === teams.length
      ? state.chances
      : null;

  const commit = (next: TeamsState) => {
    setState(next);
    saveTeams(date, next);
  };

  const deal = async ({ overrides, count, mode, slug: dealSlug }: DealInput) => {
    const nextPool = poolFor(overrides);
    const clamped = clampCount(count, nextPool.length);
    const base = { ...state, overrides, teamCount: clamped, mode, slug: dealSlug };
    const ticket = ++dealNo.current;
    setNotice(null);
    if (nextPool.length < 2) {
      commit({ ...base, teams: null, chances: null, guessed: {} });
      return;
    }
    const random = () =>
      commit({ ...base, teams: dealTeams(nextPool, clamped), chances: null, guessed: {} });
    if (mode === "random" || !dealSlug) {
      random();
      return;
    }
    setPending(true);
    try {
      const res = await balancer({
        slug: dealSlug,
        userIds: nextPool,
        teamCount: clamped,
        seed: newSeed(),
      });
      if (ticket !== dealNo.current) return;
      const guessed: TeamsState["guessed"] = {};
      for (const [id, basis] of Object.entries(res.basis))
        if (basis !== "game") guessed[id] = basis;
      commit({
        ...base,
        teams: res.teams.map((t) => t.userIds),
        chances: res.teams.map((t) => t.chance),
        guessed,
      });
    } catch {
      if (ticket !== dealNo.current) return;
      // The table is waiting: deal anyway, and say so.
      random();
      setNotice("Couldn't reach the ratings — dealt at random instead.");
    } finally {
      if (ticket === dealNo.current) setPending(false);
    }
  };

  // Pool, count, game and mode changes re-deal straight away once teams
  // exist — all deliberate taps, and a stale split on screen would be read
  // as the real one.
  const update = (patch: Partial<DealInput>) => {
    const next: DealInput = {
      overrides: state.overrides,
      count: state.teamCount,
      mode: state.mode,
      slug,
      ...patch,
    };
    if (dealt) void deal(next);
    else
      commit({
        ...state,
        overrides: next.overrides,
        teamCount: next.count,
        mode: next.mode,
        slug: next.slug,
      });
  };

  const togglePerson = (a: Attendee) => {
    const next = { ...state.overrides };
    const wantIn = !inPool.has(a.userId);
    if (wantIn === defaultInPool(a)) delete next[a.userId];
    else next[a.userId] = wantIn;
    update({ overrides: next });
  };

  // Who the balance had to guess for, named — the honest footnote to the odds.
  const guessedNames = (basis: "traits" | "unknown") =>
    Object.entries(state.guessed)
      .filter(([id, b]) => b === basis && dealtIds.has(id))
      .map(([id]) => firstName(byId.get(id)?.name ?? ""))
      .filter(Boolean);
  const newToGame = chances ? guessedNames("traits") : [];
  const unrated = chances ? guessedNames("unknown") : [];

  const summary = dealt
    ? `Teams dealt: ${teams
        .map(
          (t, i) =>
            `Team ${i + 1}${chances ? ` (${Math.round(chances[i] * 100)}% to win)` : ""} — ${t
              .map((id) => byId.get(id)?.name ?? "")
              .join(", ")}`,
        )
        .join("; ")}`
    : "";

  const canDeal = pool.length >= 2 && (!balanced || slug !== null);
  const dealLabel = balanced
    ? dealt
      ? "Another fair split"
      : "Balance teams"
    : dealt
      ? "Reshuffle"
      : "Shuffle teams";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 px-1">
        <Button variant="link" size="sm" onClick={onBack} className="-ml-1 gap-1 px-1">
          <ChevronLeftIcon className="h-4 w-4" />
          Attendees
        </Button>
        <Eyebrow tone="sky">Make teams</Eyebrow>
      </div>

      <SegmentedControl<TeamsMode>
        options={[
          { value: "balanced", label: "Balanced", title: "Fair teams from everyone's record" },
          { value: "random", label: "Random", title: "Just shuffle" },
        ]}
        value={state.mode}
        onChange={(mode) => update({ mode })}
        size="sm"
        shape="pill"
        tone="accent"
        selectionMode="toggle"
        aria-label="How to deal"
        className="self-center"
      />

      {balanced && (
        <TeamGamePicker lineup={lineup} value={slug} onChange={(s) => update({ slug: s })} />
      )}

      {dealt && (
        <div
          className={cn("flex flex-col gap-3 transition-opacity", pending && "opacity-60")}
          aria-busy={pending}
        >
          {chances && <TeamOdds chances={chances} fills={FILLS} gameTitle={gameTitle} />}
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
                          "flex items-center justify-between gap-2 px-2.5 py-1.5 text-sm font-semibold sm:px-3 sm:py-2",
                          TONE_BUBBLE[tone],
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className={cn("h-2.5 w-2.5 rounded-full", dot)}
                          />
                          Team {i + 1}
                        </span>
                        <span className="tabular-nums">
                          {chances ? `${Math.round(chances[i] * 100)}%` : team.length}
                        </span>
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
          {(newToGame.length > 0 || unrated.length > 0) && (
            <p className="px-1 text-2xs leading-relaxed text-fg-muted">
              {newToGame.length > 0 &&
                `${listNames(newToGame)} ${newToGame.length === 1 ? "hasn't" : "haven't"} played ${gameTitle ?? "it"} yet — rated from their other games. `}
              {unrated.length > 0 &&
                `${listNames(unrated)} ${unrated.length === 1 ? "has" : "have"} no rated games yet — counted as average.`}
            </p>
          )}
        </div>
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
        onChange={(count) => update({ count })}
        caption={
          pool.length >= 2 ? `teams · ${splitCaption(pool.length, teamCount)}` : "Add at least two"
        }
      />

      <p className="sr-only" aria-live="polite">
        {summary}
      </p>

      <div className="sticky bottom-0 flex flex-col items-center gap-1 bg-gradient-to-t from-surface-900 via-surface-900/90 to-transparent pt-4 pb-1">
        {notice && <p className="text-2xs text-amber-200">{notice}</p>}
        {!notice && stale && <p className="text-2xs text-amber-200">Roster changed · deal again</p>}
        {balanced && !slug && pool.length >= 2 && (
          <p className="text-2xs text-fg-muted">Pick the game to balance for</p>
        )}
        <Button
          variant="primary"
          size="lg"
          block
          disabled={!canDeal}
          loading={pending}
          onClick={() =>
            void deal({ overrides: state.overrides, count: teamCount, mode: state.mode, slug })
          }
          className="gap-2 sm:w-auto sm:min-w-56"
        >
          {balanced ? <SparkleIcon className="h-4 w-4" /> : <ShuffleIcon className="h-4 w-4" />}
          {dealLabel}
        </Button>
      </div>
    </div>
  );
}
