import "./campaign-night.css";
import { type CampaignNight, pickKeeper } from "@boardgames/core/ical/campaign";
import { useCurrentUser } from "../../hooks/useCurrentUser.ts";
import type { Attendee } from "../../lib/calendar-games";
import { DND_SLUG } from "../../lib/dnd-night.ts";
import { resolveGame } from "../../lib/games-by-slug.ts";
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { Eyebrow } from "../ui/Label";
import { Surface } from "../ui/Surface";
import { CampaignRelic } from "./CampaignRelic";

// The RSVP modal's body for a sealed campaign night (D&D among them). Replaces
// the whole pick / vote / bring-assignment flow: there's exactly one game on
// the table tonight, so instead we show a hero in the game's colours with its
// relic carrying the party size, the lone game card, and the party roster —
// the box's keeper badged (on a D&D night, the Dungeon Master instead).

type Props = {
  campaign: CampaignNight;
  attendees: Attendee[];
  /** Confirmed (definite) headcount — the party size on the relic. */
  partyCount: number;
};

export default function CampaignNightPanel({ campaign, attendees, partyCount }: Props) {
  const game = resolveGame(campaign.slug);
  const { user } = useCurrentUser();
  const viewerId = user?.id ?? null;
  const isDnd = campaign.slug === DND_SLUG;

  // D&D: the Dungeon Master is the admin whenever they're in the party
  // (definite); if no admin is coming, the night's host runs the table.
  // Every other campaign: whoever brings the box.
  const dmUserId = isDnd
    ? (attendees.find((a) => a.isAdmin && a.status === "definite")?.userId ??
      attendees.find((a) => a.isHost)?.userId ??
      null)
    : null;
  const keeper = pickKeeper(attendees, campaign);
  const keeperLine = keeper
    ? `${keeper.userId === viewerId ? "You bring" : `${keeper.name} brings`} the box. `
    : "";
  const title = game?.title ?? campaign.night;

  return (
    <div
      data-campaign={campaign.slug}
      className="scrollbar-thin flex h-full w-full max-w-3xl flex-col gap-4 overflow-y-auto px-1 py-2"
    >
      {/* Hero */}
      <div className="campaign-hero campaign-night-base relative shrink-0 overflow-hidden rounded-card-3xl border p-6 text-center">
        <span
          aria-hidden="true"
          className="campaign-hero-bloom pointer-events-none absolute inset-0"
        />
        <span
          aria-hidden="true"
          className="campaign-night-shimmer pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 motion-safe:animate-seal-shimmer"
        />
        <div className="relative flex flex-col items-center gap-3">
          <CampaignRelic
            slug={campaign.slug}
            count={partyCount}
            className="h-24 w-24 sm:h-28 sm:w-28"
          />
          <div>
            <Eyebrow inheritColor className="campaign-accent opacity-85">
              {isDnd ? "Tonight's quest" : "Tonight's campaign"}
            </Eyebrow>
            <h2 className="campaign-hero-title mt-1.5 font-serif-body text-3xl font-bold sm:text-4xl">
              {title}
            </h2>
            <p className="campaign-ink mt-2 text-sm opacity-80">
              A party of <span className="font-bold">{partyCount}</span> {campaign.party}{" "}
              {campaign.flavor}.
            </p>
          </div>
        </div>
      </div>

      {/* The one and only game on the table tonight. */}
      {game && (
        <div className="campaign-rim flex shrink-0 items-center gap-3 rounded-card-2xl border bg-surface-900/80 p-3">
          <img
            src={game.thumbnail}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-16 w-16 shrink-0 rounded-card-xl object-cover"
          />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-fg-strong">{game.title}</h3>
            <p className="mt-0.5 text-2xs leading-relaxed text-fg-secondary">
              The only game on the table tonight. {keeperLine}
              {campaign.bring}
            </p>
          </div>
        </div>
      )}

      {/* The party — no bringing assignments on a campaign night. */}
      <div className="shrink-0">
        <Eyebrow inheritColor className="campaign-accent px-2 font-serif-body">
          The party
        </Eyebrow>
        {attendees.length === 0 ? (
          <p className="mt-2 px-2 text-2xs text-fg-muted">The party is still assembling…</p>
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
                <Avatar name={a.name} image={a.image} accentHex={a.accentHex} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg-strong">
                  {a.name}
                  {a.userId === viewerId && (
                    <span className="font-normal text-fg-muted"> (you)</span>
                  )}
                </span>
                {a.userId === dmUserId ? (
                  <Badge tone="amber" shape="pill" size="xs">
                    Dungeon Master
                  </Badge>
                ) : a.userId === keeper?.userId ? (
                  <Badge shape="pill" size="xs" className="campaign-tint">
                    Brings the box
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
