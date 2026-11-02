import "./campaign-night.css";
import { type CampaignNight, pickKeeper } from "@boardgames/core/ical/campaign";
import { type CalendarLocks, nightDate } from "@boardgames/core/protocol";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useCurrentUser } from "../../hooks/useCurrentUser.ts";
import type { Attendee } from "../../lib/calendar-games";
import { cn } from "../../lib/cn";
import { formatDayKey } from "../../lib/date-format.ts";
import { DND_SLUG } from "../../lib/dnd-night.ts";
import { resolveGame } from "../../lib/games-by-slug.ts";
import { fetchHistory } from "../../lib/match-history";
import { fetchPlayers } from "../../lib/profile.ts";
import { qk } from "../../lib/query-keys";
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Eyebrow } from "../ui/Label";
import { CampaignRelic } from "./CampaignRelic";
import {
  type CampaignSession,
  campaignSessions,
  matchChip,
  nextMission,
  summaryLine,
} from "./campaign-sessions";

// The RSVP modal's body for a campaign night (D&D among them): the campaign
// as one thread. Past sessions sit above tonight — each with its party and
// what was played (a mission chip per match: "#3 ✓") — tonight is the lit
// node with the party and who brings the box, planned sessions follow, and
// the thread ends in "Find the next session" for an admin: the find-a-date
// flow with this party picked and the night's game set, so it needs no vote.

type Props = {
  campaign: CampaignNight;
  /** This night's key. */
  date: string;
  attendees: Attendee[];
  /** Confirmed (definite) headcount — the party size on the relic. */
  partyCount: number;
  /** Every locked night: the campaign's other sessions are read from them. */
  locks: CalendarLocks | undefined;
  /** Admin: find a date for the next session with this party. */
  onFindNextSession?: (partyIds: string[]) => void;
};

type Person = { id: string; name: string; image: string | null; accentHex: string | null };

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const PHONE_FACES = 3;
const day = (key: string) => formatDayKey(nightDate(key), "short");

export default function CampaignNightPanel({
  campaign,
  date,
  attendees,
  partyCount,
  locks,
  onFindNextSession,
}: Props) {
  const game = resolveGame(campaign.slug);
  const { user, isAdmin } = useCurrentUser();
  const viewerId = user?.id ?? null;
  const isDnd = campaign.slug === DND_SLUG;

  const historyQuery = useQuery({
    queryKey: qk.historyByGame(campaign.slug),
    queryFn: ({ signal }) => fetchHistory({ game: campaign.slug, limit: 200, signal }),
  });
  const playersQuery = useQuery({
    queryKey: qk.players(),
    queryFn: ({ signal }) => fetchPlayers(signal),
  });

  const sessions = useMemo(
    () => campaignSessions(campaign.slug, locks ?? {}, date, historyQuery.data?.matches ?? []),
    [campaign.slug, locks, date, historyQuery.data],
  );
  const people = useMemo(() => {
    const map = new Map<string, Person>();
    for (const p of playersQuery.data?.players ?? []) {
      map.set(p.id, { id: p.id, name: p.name, image: p.image, accentHex: p.accentHex });
    }
    for (const a of attendees) {
      map.set(a.userId, {
        id: a.userId,
        name: a.name,
        image: a.image ?? null,
        accentHex: a.accentHex ?? null,
      });
    }
    return map;
  }, [playersQuery.data, attendees]);

  // D&D: the Dungeon Master is the admin whenever they're in the party
  // (definite); if no admin is coming, the night's host runs the table.
  // Every other campaign: whoever brings the box.
  const dmUserId = isDnd
    ? (attendees.find((a) => a.isAdmin && a.status === "definite")?.userId ??
      attendees.find((a) => a.isHost)?.userId ??
      null)
    : null;
  const keeper = pickKeeper(attendees, campaign);
  const title = game?.title ?? campaign.night;

  const past = sessions.filter((s) => s.when === "past");
  const tonight = sessions.find((s) => s.when === "tonight");
  const upcoming = sessions.filter((s) => s.when === "upcoming");
  const next = nextMission(campaign.slug, sessions);
  const party = attendees.filter((a) => a.status === "definite");
  const canFind = isAdmin && onFindNextSession !== undefined;

  return (
    <div
      data-campaign={campaign.slug}
      className="scrollbar-thin flex h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto px-1 py-2"
    >
      <header className="flex shrink-0 items-center gap-3">
        <CampaignRelic slug={campaign.slug} count={partyCount} className="h-14 w-14 shrink-0" />
        <div className="min-w-0">
          <h2 className="campaign-hero-title truncate font-serif-body text-2xl font-bold">
            {title}
          </h2>
          <p className="mt-0.5 text-xs text-fg-secondary">
            {summaryLine(campaign.slug, sessions, day)}
          </p>
        </div>
      </header>

      <ol className="campaign-thread relative flex shrink-0 flex-col gap-1">
        {past.map((s) => (
          <SessionNode key={s.nightKey} session={s} people={people} />
        ))}

        <li className="relative py-2 pl-9">
          <span
            aria-hidden="true"
            className="campaign-pin campaign-pin-tonight absolute top-2.5 left-0 size-6 rounded-full"
          />
          <div className="campaign-now relative overflow-hidden rounded-card-2xl border p-3.5">
            <span
              aria-hidden="true"
              className="campaign-now-bloom pointer-events-none absolute inset-0"
            />
            <div className="relative flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <Eyebrow inheritColor className="campaign-accent">
                  {isDnd ? "Tonight's quest" : "Tonight"} · session {tonight?.n ?? 1}
                </Eyebrow>
                {next && (
                  <span className="campaign-ink text-xs opacity-80">
                    Next: #{next.n} {next.label}
                  </span>
                )}
              </div>
              {tonight && tonight.matches.length > 0 && <MatchChips session={tonight} />}
              {party.length === 0 ? (
                <p className="campaign-ink text-xs opacity-80">The party is still assembling…</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5" aria-label="Tonight's party">
                  {party.map((a) => (
                    <li
                      key={a.userId}
                      className="campaign-chip-ink campaign-ink inline-flex h-8 items-center gap-1.5 rounded-full pr-2.5 pl-1 text-xs"
                    >
                      <Avatar name={a.name} image={a.image} accentHex={a.accentHex} size="xs" />
                      <span className="font-semibold">
                        {firstName(a.name)}
                        {a.userId === viewerId && (
                          <span className="font-normal opacity-70"> (you)</span>
                        )}
                      </span>
                      {a.userId === dmUserId ? (
                        <span className="campaign-accent">· Dungeon Master</span>
                      ) : a.userId === keeper?.userId ? (
                        <span className="campaign-accent">· brings the box</span>
                      ) : a.isHost ? (
                        <span className="opacity-70">· host</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              <p className="campaign-ink text-xs leading-relaxed opacity-75">{campaign.bring}</p>
            </div>
          </div>
        </li>

        {upcoming.map((s) => (
          <SessionNode key={s.nightKey} session={s} people={people} />
        ))}

        <li className="relative py-2 pl-9">
          <span
            aria-hidden="true"
            className="campaign-pin campaign-pin-upcoming absolute top-4 left-1 size-4 rounded-full"
          />
          {canFind ? (
            <Button
              variant="ghost"
              size="md"
              block
              onClick={() => onFindNextSession?.(party.map((a) => a.userId))}
              className="campaign-dashed justify-start border border-dashed font-bold"
            >
              + Find the next session
            </Button>
          ) : (
            <p className="py-2 text-xs text-fg-muted">
              {upcoming.length > 0
                ? `Session ${upcoming[upcoming.length - 1]?.n} is the last one planned.`
                : "No next session planned yet."}
            </p>
          )}
        </li>
      </ol>
    </div>
  );
}

function SessionNode({
  session,
  people,
}: {
  session: CampaignSession;
  people: ReadonlyMap<string, Person>;
}) {
  const party = session.partyIds.map(
    (id) => people.get(id) ?? { id, name: "?", image: null, accentHex: null },
  );
  const upcoming = session.when === "upcoming";
  const meta = [
    session.hostName ? `${firstName(session.hostName)} ${upcoming ? "hosts" : "hosted"}` : null,
    upcoming ? session.eventTime : `${party.length} played`,
  ].filter(Boolean);
  return (
    <li className="relative py-2.5 pl-9">
      <span
        aria-hidden="true"
        className={cn(
          "campaign-pin absolute top-3.5 left-1 size-4 rounded-full",
          upcoming ? "campaign-pin-upcoming" : "campaign-pin-past",
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold whitespace-nowrap text-fg-strong">
            Session {session.n} · {day(session.nightKey)}
          </p>
          <p className="text-xs text-fg-muted">{meta.join(" · ")}</p>
        </div>
        {/* Phones show three faces and a count, so the title keeps its line. Each
            face overlaps the one before it (not space-x: the hidden count would
            be the last child and push the last face past the panel's edge). */}
        <ul className="flex shrink-0 items-center" aria-label={`Session ${session.n} party`}>
          {party.map((p, i) => (
            <li
              key={p.id}
              title={p.name}
              className={cn(i > 0 && "-ml-1.5", i >= PHONE_FACES && "hidden sm:block")}
            >
              <Avatar name={p.name} image={p.image} accentHex={p.accentHex} size="xs" />
            </li>
          ))}
          {party.length > PHONE_FACES && (
            <li className="pl-2.5 text-xs text-fg-muted sm:hidden">
              +{party.length - PHONE_FACES}
            </li>
          )}
        </ul>
      </div>
      {session.matches.length > 0 && <MatchChips session={session} />}
    </li>
  );
}

function MatchChips({ session }: { session: CampaignSession }) {
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1" aria-label={`Session ${session.n} matches`}>
      {session.matches.map((m) => {
        const chip = matchChip(m);
        return (
          <li key={m.id} title={chip.title}>
            <Badge
              size="xs"
              tone={chip.tone === "won" ? "emerald" : chip.tone === "lost" ? "rose" : "neutral"}
            >
              {chip.label}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}
