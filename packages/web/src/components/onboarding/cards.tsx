import type { RsvpStatus } from "@boardgames/core/protocol";
import { type ReactNode, useState } from "react";
import { cn } from "../../lib/cn";
import { resolveGame } from "../../lib/games-by-slug";
import type { Availability } from "../../lib/offline-availability";
import { CheckIcon, ClockIcon, GearIcon, StarIcon, UserIcon } from "../icons";
import { REACTION_KINDS, ReactionButtons } from "../offline/ReactionButtons";
import { RSVP_OPTIONS } from "../offline/RsvpModal";
import { SegmentedControl, Surface } from "../ui";
import { FlameArt } from "../ui/FlameArt.tsx";
import { DemoDay, lockedNight, privateNight } from "./demo-cells";

// The welcome tour's cards: one idea each, at most two short sentences, the
// real UI words in bold — and wherever there's something to learn by doing,
// the real control to try it on. A card reports "tried" when the member has
// done the thing (that ticks its "Try it" line and nudges Next; it never
// blocks it).

export interface CardProps {
  firstName: string | null;
  tried: boolean;
  markTried: () => void;
}

export interface TourCard {
  id: string;
  title: string;
  /** What to do on this card, ticked when done. */
  tryIt?: string;
  Body: (props: CardProps) => ReactNode;
}

function Lead({ children }: { children: ReactNode }) {
  return (
    <p className="mx-auto max-w-md text-center text-base leading-relaxed text-fg-primary">
      {children}
    </p>
  );
}

function Note({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "amber" }) {
  return (
    <p
      className={cn(
        "mx-auto w-full max-w-md rounded-card-md px-3 py-2 text-center text-sm leading-relaxed",
        tone === "amber" ? "bg-amber-500/10 text-amber-100" : "bg-fill-soft text-fg-secondary",
      )}
    >
      {children}
    </p>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-start justify-center gap-3 sm:gap-4">{children}</div>;
}

// ── 1. Welcome ──────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, title: "Mark your free days", text: "so the group can find a night" },
  { n: 2, title: "Say if you're coming", text: "when a night is locked in" },
  { n: 3, title: "Vote for games", text: "so the table plays what you like" },
];

function Welcome({ firstName }: CardProps) {
  return (
    <>
      <Lead>
        {firstName ? `Hi ${firstName}! ` : "Hi! "}
        Game nights here take <strong>three simple steps</strong>. This takes a minute.
      </Lead>
      <ol className="flex flex-col gap-2">
        {STEPS.map((s) => (
          <li key={s.n}>
            <Surface variant="tile" padding="sm" className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-500/20 text-base font-bold text-accent-200">
                {s.n}
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold text-fg-strong">{s.title}</span>
                <span className="text-xs text-fg-secondary">{s.text}</span>
              </span>
            </Surface>
          </li>
        ))}
      </ol>
    </>
  );
}

// ── 2. Mark your days ───────────────────────────────────────────────────

function cycle(v: Availability | undefined): Availability | undefined {
  return v === undefined ? "can" : v === "can" ? "maybe" : undefined;
}

function MarkDays({ markTried }: CardProps) {
  const [marks, setMarks] = useState<(Availability | undefined)[]>([
    undefined,
    undefined,
    undefined,
  ]);
  const tap = (i: number) => {
    const next = marks.map((v, j) => (j === i ? cycle(v) : v));
    setMarks(next);
    if (next.includes("can") && next.includes("maybe")) markTried();
  };
  return (
    <>
      <Lead>
        Tap a day: once = <strong>Can</strong>, twice = <strong>Maybe</strong>, three times = clear.
      </Lead>
      <Row>
        {[12, 13, 14].map((day, i) => (
          <DemoDay key={day} day={day} value={marks[i]} onClick={() => tap(i)} />
        ))}
      </Row>
      <Note>
        On the calendar, press <strong>Change my availability</strong>, tap your days, then{" "}
        <strong>Save</strong>.
      </Note>
    </>
  );
}

// ── 3. Hot days ─────────────────────────────────────────────────────────

function HotDays() {
  return (
    <>
      <Lead>
        Days fill up as people mark them. <strong>3</strong> can = warming up,{" "}
        <strong>4 or more</strong> = on fire <FlameArt className="inline h-4 w-4 align-[-0.15em]" />
        .
      </Lead>
      <Row>
        <DemoDay day={9} value="can" label="Just you" />
        <DemoDay day={10} heat={{ kind: "warming", can: 3, maybe: 1 }} label="Warming up · 3" />
        <DemoDay day={11} heat={{ kind: "fire", can: 5, maybe: 0 }} label="On fire · 5" />
      </Row>
      <Note>The hottest days are where game nights get locked in.</Note>
    </>
  );
}

// ── 4. A locked-in night ────────────────────────────────────────────────

function LockedNight({ tried, markTried }: CardProps) {
  return (
    <>
      <Lead>
        A day with an <strong>RSVP</strong> badge is a locked-in game night. Tap it to see who's
        coming, where and when.
      </Lead>
      <Row>
        <DemoDay day={18} night={lockedNight()} onClick={markTried} label="Tap me" />
      </Row>
      {tried ? (
        <Surface variant="tile" padding="sm" className="flex flex-col gap-1 text-sm">
          <span className="text-2xs font-semibold uppercase tracking-eyebrow text-accent-300">
            Game night · 4 going + 1 maybe
          </span>
          <span className="font-semibold text-fg-strong">Saturday, 18:00</span>
          <span className="text-fg-secondary">
            Host and address are shown here, with a map link.
          </span>
        </Surface>
      ) : (
        <Note>
          While it pulses, the night is waiting for your answer. After that the badge shows{" "}
          <strong>Going</strong> or <strong>Pass</strong>.
        </Note>
      )}
    </>
  );
}

// ── 5. Going or not ─────────────────────────────────────────────────────

function GoingOrNot({ markTried }: CardProps) {
  const [rsvp, setRsvp] = useState<RsvpStatus>("yes");
  const [flips, setFlips] = useState(0);
  const change = (next: RsvpStatus) => {
    if (next === rsvp) return;
    setRsvp(next);
    setFlips(flips + 1);
    if (flips + 1 >= 2) markTried();
  };
  return (
    <>
      <Note tone="amber">
        Opening a night marks you <strong>✓ Going</strong> right away.
      </Note>
      <Lead>
        Can't make it? Switch to <strong>✗ Not going</strong>. You can switch back any time.
      </Lead>
      <Row>
        <DemoDay
          day={18}
          night={lockedNight(rsvp)}
          label={rsvp === "yes" ? "You're going" : "You're out"}
        />
      </Row>
      <div className="flex justify-center">
        <SegmentedControl
          options={RSVP_OPTIONS}
          value={rsvp}
          onChange={change}
          size="md"
          shape="pill"
          selectionMode="toggle"
          aria-label="RSVP"
        />
      </div>
    </>
  );
}

// ── 6. Vote for games ───────────────────────────────────────────────────

const VOTE_MEANING: Record<string, string> = {
  hype: "I want to play this",
  teach: "I know it — I'll explain the rules",
  learn: "I haven't played — teach me",
};

function VoteGames({ markTried }: CardProps) {
  const game = resolveGame("azul") ?? resolveGame("catan");
  const [viewer, setViewer] = useState<("hype" | "teach" | "learn")[]>([]);
  return (
    <>
      <Lead>Inside a night, vote for the games you'd like on the table.</Lead>
      <div className="flex justify-center">
        <div className="relative w-44 overflow-hidden rounded-card-lg border border-line-soft">
          {game && (
            <img
              src={game.thumbnail}
              alt={game.title}
              className="aspect-video w-full object-cover"
            />
          )}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
            <ReactionButtons
              aggregate={{ hype: 0, teach: 0, learn: 0, viewer }}
              accentHex={game?.accentHex ?? "#7c6cf0"}
              hideCount
              onToggle={(kind, on) => {
                setViewer((cur) => (on ? [...cur, kind] : cur.filter((k) => k !== kind)));
                if (kind === "hype" && on) markTried();
              }}
            />
          </div>
        </div>
      </div>
      <ul className="flex flex-col gap-1.5">
        {REACTION_KINDS.map(({ kind, label, Icon }) => (
          <li key={kind} className="flex items-center gap-3 text-sm">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-strong p-1.5 text-fg-strong">
              <Icon filled={false} />
            </span>
            <span>
              <strong className="text-fg-strong">{label}</strong>{" "}
              <span className="text-fg-secondary">= {VOTE_MEANING[kind]}</span>
            </span>
          </li>
        ))}
      </ul>
      <Note>
        Nobody sees your votes while picking. <strong>Results</strong> ranks games by Hype.
      </Note>
    </>
  );
}

// ── 7. Private nights ───────────────────────────────────────────────────

function PrivateNights() {
  return (
    <>
      <Lead>
        Some nights are <strong>invite-only</strong> with a few seats. You'll get a "You're invited"
        card.
      </Lead>
      <Row>
        <DemoDay
          day={22}
          night={privateNight("invited", { total: 6, taken: 4, waitlisted: 0 })}
          label="Invited"
          compact
        />
        <DemoDay
          day={23}
          night={privateNight("seated", { total: 6, taken: 5, waitlisted: 0 })}
          label="You have a seat"
          compact
        />
        <DemoDay
          day={24}
          night={privateNight("waitlisted", { total: 6, taken: 6, waitlisted: 2 })}
          label="Waitlist"
          compact
        />
      </Row>
      <Note>Full? You join the waitlist and get the next free seat automatically.</Note>
    </>
  );
}

// ── 8. More to explore ──────────────────────────────────────────────────

const EXTRAS = [
  {
    Icon: StarIcon,
    title: "Purchase vote",
    text: "3 votes to choose which new games the group buys.",
  },
  { Icon: UserIcon, title: "Your profile", text: "Your games, stats and badges." },
  { Icon: ClockIcon, title: "History", text: "Every match the group has played." },
  {
    Icon: GearIcon,
    title: "Calendar sync & look",
    text: "Nights in your phone's calendar; your colours.",
  },
];

function MoreToExplore() {
  return (
    <>
      <Lead>A few more things, for when you're curious:</Lead>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {EXTRAS.map(({ Icon, title, text }) => (
          <li key={title}>
            <Surface variant="tile" padding="sm" className="flex h-full items-start gap-3">
              <span className="mt-0.5 text-accent-300">
                <Icon className="h-5 w-5" />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold text-fg-strong">{title}</span>
                <span className="text-xs text-fg-secondary">{text}</span>
              </span>
            </Surface>
          </li>
        ))}
      </ul>
    </>
  );
}

// ── 9. Ready ────────────────────────────────────────────────────────────

const RECAP = ["Mark your free days", "Answer locked-in nights", "Vote for games"];

function Ready({ firstName }: CardProps) {
  return (
    <>
      <div className="flex justify-center">
        <FlameArt className="h-16 w-16" />
      </div>
      <Lead>
        {firstName ? `You're ready, ${firstName}!` : "You're ready!"} Start by marking the days
        you're free.
      </Lead>
      <ul className="flex flex-col gap-1.5">
        {RECAP.map((t) => (
          <li key={t} className="flex items-center justify-center gap-2 text-sm text-fg-primary">
            <CheckIcon className="h-4 w-4 text-emerald-300" />
            {t}
          </li>
        ))}
      </ul>
    </>
  );
}

export const TOUR_CARDS: readonly TourCard[] = [
  { id: "welcome", title: "Welcome to game nights", Body: Welcome },
  {
    id: "mark",
    title: "1 · Mark when you're free",
    tryIt: "Make one day Can and one Maybe",
    Body: MarkDays,
  },
  { id: "heat", title: "Hot days", Body: HotDays },
  {
    id: "locked",
    title: "2 · A night is locked in",
    tryIt: "Tap the day marked RSVP",
    Body: LockedNight,
  },
  {
    id: "rsvp",
    title: "Going or not?",
    tryIt: "Switch to Not going, then back",
    Body: GoingOrNot,
  },
  { id: "vote", title: "3 · Vote for games", tryIt: "Press the heart", Body: VoteGames },
  { id: "private", title: "Invite-only nights", Body: PrivateNights },
  { id: "more", title: "More to explore", Body: MoreToExplore },
  { id: "ready", title: "That's it!", Body: Ready },
];
