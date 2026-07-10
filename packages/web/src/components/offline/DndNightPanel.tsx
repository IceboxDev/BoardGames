import { useCurrentUser } from "../../hooks/useCurrentUser.ts";
import type { Attendee } from "../../lib/calendar-games";
import { DND_SLUG } from "../../lib/dnd-night.ts";
import { resolveGame } from "../../lib/games-by-slug.ts";
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { Eyebrow } from "../ui/Label";
import { Surface } from "../ui/Surface";
import { D20Die } from "./D20Die";

// The RSVP modal's body for a sealed D&D night. Replaces the whole pick / vote
// / bring-assignment flow: there's exactly one game on the table tonight, so
// instead we show a torch-lit hero with a d20 party-size, the lone D&D card,
// and the party roster (host badged as Dungeon Master) — no bringing list,
// because nobody needs to bring anything but their dice.

const SERIF = { fontFamily: "ui-serif, Georgia, serif" } as const;

type Props = {
  attendees: Attendee[];
  /** Confirmed (definite) headcount — the party size on the die. */
  partyCount: number;
};

export default function DndNightPanel({ attendees, partyCount }: Props) {
  const game = resolveGame(DND_SLUG);
  const { user } = useCurrentUser();
  const viewerId = user?.id ?? null;

  // The Dungeon Master is the admin whenever they're in the party (definite);
  // if no admin is coming, the night's host runs the table instead. Everyone
  // else is a player.
  const dmUserId =
    attendees.find((a) => a.isAdmin && a.status === "definite")?.userId ??
    attendees.find((a) => a.isHost)?.userId ??
    null;

  return (
    <div className="scrollbar-thin flex h-full w-full max-w-3xl flex-col gap-4 overflow-y-auto px-1 py-2">
      {/* Hero */}
      <div className="dnd-hero-glow relative shrink-0 overflow-hidden rounded-3xl border border-amber-400/30 bg-gradient-to-br from-[#3b0a0a] via-[#1a0606] to-black p-6 text-center">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_60%_at_50%_28%,rgba(220,38,38,0.5),transparent_72%)]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-amber-200/20 to-transparent motion-safe:animate-seal-shimmer"
        />
        <div className="relative flex flex-col items-center gap-3">
          <D20Die
            count={partyCount}
            className="dnd-die dnd-die-animated h-24 w-24 sm:h-28 sm:w-28"
          />
          <div>
            <Eyebrow tone="amber" className="text-amber-300/80">
              Tonight's quest
            </Eyebrow>
            <h2
              className="mt-1.5 text-3xl font-bold text-amber-100 sm:text-4xl"
              style={{ ...SERIF, textShadow: "0 2px 14px rgba(0,0,0,0.7)" }}
            >
              Dungeons &amp; Dragons
            </h2>
            <p className="mt-2 text-sm text-amber-200/75">
              A party of <span className="font-bold text-amber-100">{partyCount}</span>{" "}
              {partyCount === 1 ? "adventurer" : "adventurers"} gathers by torchlight.
            </p>
          </div>
        </div>
      </div>

      {/* The one and only game on the table tonight. */}
      {game && (
        <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-amber-400/25 bg-surface-900/80 p-3">
          <img
            src={game.thumbnail}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-16 w-16 shrink-0 rounded-xl object-cover ring-1 ring-amber-400/30"
          />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-white">{game.title}</h3>
            <p className="mt-0.5 text-2xs leading-relaxed text-fg-secondary">
              The only thing on the table tonight. Bring nothing but your dice, your character
              sheet, and your courage — the Dungeon Master has the rest.
            </p>
          </div>
        </div>
      )}

      {/* The party — no bringing assignments on a D&D night. */}
      <div className="shrink-0">
        <Eyebrow tone="amber" className="px-2" style={SERIF}>
          The party
        </Eyebrow>
        {attendees.length === 0 ? (
          <p className="mt-2 px-2 text-2xs text-fg-muted">The adventurers are still assembling…</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {attendees.map((a) => (
              <Surface
                as="li"
                key={a.userId}
                variant="raised"
                padding="none"
                className="flex items-center gap-3 px-3 py-2.5"
              >
                <Avatar name={a.name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                  {a.name}
                  {a.userId === viewerId && (
                    <span className="font-normal text-fg-muted"> (you)</span>
                  )}
                </span>
                {a.userId === dmUserId ? (
                  <Badge tone="amber" shape="pill" size="xs">
                    Dungeon Master
                  </Badge>
                ) : a.isHost ? (
                  <Badge tone="neutral" shape="pill" size="xs">
                    Host
                  </Badge>
                ) : a.status === "tentative" ? (
                  <Badge tone="neutral" shape="pill" size="xs">
                    Maybe
                  </Badge>
                ) : null}
              </Surface>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
