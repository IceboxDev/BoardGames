import { useMemo } from "react";
import { games as gameRegistry } from "../../games/registry";
import type { GameDefinition } from "../../games/types";
import type { Attendee } from "../../lib/calendar-games";

type Props = {
  attendees: Attendee[];
  topSlugs: string[];
};

export default function AttendeesView({ attendees, topSlugs }: Props) {
  const slugToGame = useMemo(() => {
    const m = new Map<string, GameDefinition>();
    for (const g of gameRegistry) m.set(g.slug, g);
    return m;
  }, []);

  const bringerCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of attendees) {
      for (const slug of a.bringing) counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    return counts;
  }, [attendees]);

  const missing = useMemo(
    () => topSlugs.filter((s) => (bringerCount.get(s) ?? 0) === 0),
    [topSlugs, bringerCount],
  );

  if (attendees.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 px-8 py-10 text-center">
        <p className="text-sm font-medium text-gray-300">Nobody's confirmed yet.</p>
        <p className="mt-1 text-xs text-gray-500">
          When people RSVP, they'll show up here with their picks and what they're bringing.
        </p>
      </div>
    );
  }

  return (
    <div className="scrollbar-thin flex h-full w-full max-w-3xl flex-col gap-2 overflow-y-auto px-1 py-2">
      <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-sky-300">
        Who's coming
      </p>
      <ul className="flex flex-col gap-2">
        {attendees.map((a) => (
          <li key={a.userId}>
            <AttendeeRow attendee={a} slugToGame={slugToGame} />
          </li>
        ))}
      </ul>
      {topSlugs.length > 0 && (
        <CoverageFooter
          covered={topSlugs.length - missing.length}
          total={topSlugs.length}
          missing={missing}
          slugToGame={slugToGame}
        />
      )}
    </div>
  );
}

function AttendeeRow({
  attendee,
  slugToGame,
}: {
  attendee: Attendee;
  slugToGame: Map<string, GameDefinition>;
}) {
  const initial = attendee.name[0]?.toUpperCase() ?? "?";
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-surface-900/80 px-3 py-3 sm:px-4">
      <span
        aria-hidden="true"
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${
          attendee.isHost
            ? "bg-amber-500/25 ring-1 ring-amber-400/60"
            : "bg-surface-800 ring-1 ring-white/10"
        }`}
      >
        {initial}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-white">{attendee.name}</span>
          {attendee.isHost && (
            <span className="shrink-0 rounded-full bg-amber-400/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-amber-200">
              Host
            </span>
          )}
          {attendee.status === "tentative" && (
            <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-gray-400">
              Maybe
            </span>
          )}
          {!attendee.hasRsvped && (
            <span
              title="Marked availability but never opened the RSVP modal — ping them in real life."
              className="shrink-0 rounded-full bg-sky-400/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-sky-200 ring-1 ring-sky-400/40"
            >
              Hasn't RSVP'd yet
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-400">
          <VoteChip kind="hype" count={attendee.votes.hype} />
          <VoteChip kind="teach" count={attendee.votes.teach} />
          <VoteChip kind="learn" count={attendee.votes.learn} />
        </div>

        <BringingList attendee={attendee} slugToGame={slugToGame} />
      </div>
    </div>
  );
}

function BringingList({
  attendee,
  slugToGame,
}: {
  attendee: Attendee;
  slugToGame: Map<string, GameDefinition>;
}) {
  if (attendee.status === "tentative") {
    return (
      <span className="text-[11px] text-gray-500">No bringing assignment until they confirm.</span>
    );
  }
  if (attendee.bringing.length === 0) {
    return (
      <span className="text-[11px] text-gray-500">
        {attendee.isHost
          ? "Doesn't own any of tonight's top picks."
          : "Not bringing top-5 games this time."}
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {attendee.isHost && (
        <span className="inline-flex items-center rounded-full bg-amber-400/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-200">
          From their collection
        </span>
      )}
      {attendee.bringing.map((slug) => {
        const g = slugToGame.get(slug);
        if (!g) return null;
        return (
          <span
            key={slug}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-800 px-2 py-1 text-[11px] text-gray-200 ring-1 ring-[var(--accent)]/40"
            style={{ "--accent": g.accentHex } as React.CSSProperties}
          >
            <img
              src={g.thumbnail}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-4 w-4 shrink-0 rounded-sm object-cover"
            />
            <span className="truncate">{g.title}</span>
          </span>
        );
      })}
    </div>
  );
}

function VoteChip({ kind, count }: { kind: "hype" | "teach" | "learn"; count: number }) {
  const dim = count === 0;
  const meta = {
    hype: { label: "Hype", icon: "♥" },
    teach: { label: "Teach", icon: "🎓" },
    learn: { label: "Learn", icon: "📖" },
  }[kind];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ${
        dim ? "bg-white/[0.03] text-gray-600" : "bg-white/[0.06] text-gray-200"
      }`}
      title={`${meta.label}: ${count}`}
    >
      <span aria-hidden="true">{meta.icon}</span>
      <span className="font-semibold tabular-nums">{count}</span>
      <span className="sr-only">{meta.label}</span>
    </span>
  );
}

function CoverageFooter({
  covered,
  total,
  missing,
  slugToGame,
}: {
  covered: number;
  total: number;
  missing: string[];
  slugToGame: Map<string, GameDefinition>;
}) {
  if (total === 0) return null;
  const allCovered = missing.length === 0;
  return (
    <div
      className={`mt-1 rounded-2xl border px-3 py-2.5 text-[11px] sm:px-4 ${
        allCovered
          ? "border-emerald-400/30 bg-emerald-400/[0.06] text-emerald-100"
          : "border-amber-400/30 bg-amber-400/[0.06] text-amber-100"
      }`}
    >
      <p className="font-semibold">
        Top-5 coverage: {covered}/{total}
      </p>
      {!allCovered && (
        <p className="mt-1 text-[11px] text-amber-200/80">
          Nobody attending owns:{" "}
          {missing.map((slug) => slugToGame.get(slug)?.title ?? slug).join(", ")}
        </p>
      )}
    </div>
  );
}
