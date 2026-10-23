import "./calendar-fire.css";
import "./campaign-night.css";
import type { CampaignNight } from "@boardgames/core/ical/campaign";
import { nightSlot } from "@boardgames/core/protocol";
import { Children, type ReactNode } from "react";
import type { NightSeats } from "../../lib/calendar-locks";
import type { RsvpStatus } from "../../lib/calendar-rsvps";
import type { ViewerSeat } from "../../lib/night-access";
import type { Availability, AvailabilityEntry } from "../../lib/offline-availability";
import { CampaignRelic } from "./CampaignRelic";
import { firstName } from "./group-fit";

/** What a private night's cell needs beyond the lock: the tally and the viewer's own place. */
export type PrivateNightCell = {
  seats: NightSeats;
  viewerSeat: ViewerSeat | null;
};

export type Heat =
  | { kind: "neutral" }
  | { kind: "warming"; can: 3; maybe: number }
  | { kind: "fire"; can: number; maybe: number };

/**
 * One locked night as the cell paints it. A date carries up to two of these
 * (its second night is keyed `date_2`); two — or one beside the free slot an
 * admin may fill — split the cell into panes, one per night.
 */
export type NightCell = {
  /** The night's key: its date, or `date_2` for the second night on it. */
  key: string;
  picksLocked: boolean;
  attendance: { definite: number; tentative: number } | null;
  /** Sealed night whose vote winner is a campaign game — swaps in its colours and relic. */
  campaign: CampaignNight | null;
  /** Private (invitation-only) night — swaps in the frosted graphite treatment. */
  privateNight: PrivateNightCell | null;
  viewerRsvp?: RsvpStatus;
  /** Whether tapping the night does anything (RSVP modal, lock-mode edit). */
  interactive: boolean;
  onClick: () => void;
};

/**
 * Lock mode's "Find a date": how this date suits the group the admin picked.
 * `available` counts can + maybe; `maybe` how many of those are only maybes.
 */
export type GroupCell = {
  tier: "all" | "most" | "none";
  available: number;
  total: number;
  maybe: number;
  /** First names of the picked members with no mark that day. */
  missing: string[];
};

export type DayCellProps = {
  day: number;
  monthBucket: 0 | 1 | 2;
  monthLabel: string | null;
  value: Availability | undefined;
  isToday: boolean;
  isPast: boolean;
  /** Whether an UNLOCKED cell responds to `onClick`; a night's own clickability rides in `nights`. */
  interactive: boolean;
  compact: boolean;
  labels?: AvailabilityEntry[];
  /** True when admin overlay is active for the whole calendar (drives label vs personal-status priority). */
  isAdminView: boolean;
  heat: Heat;
  /** The date's locked nights, first slot first — none, one, or two. */
  nights: NightCell[];
  /** Lock mode, one night on the date: tapping the free slot's pane locks a second. */
  addNight?: (() => void) | null;
  lockMode: boolean;
  /** Admin "away" note: the owner is known to be unavailable (never with a `value`). */
  away?: boolean;
  /** "Find a date" is on: the date's fit for the picked group. */
  group?: GroupCell | null;
  cellSeed: number;
  /** Click on an UNLOCKED cell (cycle availability, toggle away, lock in). */
  onClick: () => void;
  /** A first-use hint points here (`data-tour`), e.g. the next night waiting for an answer. */
  tourAnchor?: string;
};

export function DayCell(props: DayCellProps) {
  const { nights, addNight } = props;
  // Two nights — or one beside the slot an admin may still fill — share the
  // cell as panes. Everything else is the one-night cell it always was.
  if (nights.length >= 2 || (nights.length === 1 && addNight)) {
    return <SplitDayCell {...props} />;
  }
  return <SingleDayCell {...props} night={nights[0] ?? null} />;
}

function SingleDayCell({
  day,
  monthBucket,
  monthLabel,
  value,
  isToday,
  isPast,
  interactive,
  compact,
  labels,
  isAdminView,
  heat,
  night,
  lockMode,
  away = false,
  group = null,
  cellSeed,
  onClick,
  tourAnchor,
}: DayCellProps & { night: NightCell | null }) {
  const locked = night !== null;
  const picksLocked = !!night?.picksLocked;
  const attendance = night?.attendance ?? null;
  const campaign = night?.campaign ?? null;
  const privateNight = night?.privateNight ?? null;
  const viewerRsvp = night?.viewerRsvp;
  // A locked night decides its own clickability; an unlocked cell the caller's.
  const clickable = night ? night.interactive : interactive;
  const heated = heat.kind !== "neutral";
  // Lock visually overrides heat (and personal mark gradient).
  const showHeatLayer = !locked && heated;
  const showPersonalGradient = !locked && !heated && value;
  // Campaign night: a sealed night whose vote winner is a campaign game (D&D
  // among them). Takes over the locked cell entirely — the game's frame and
  // background, its relic carrying the headcount.
  const showCampaign = !!campaign && picksLocked && !!attendance;
  // Private night: frosted graphite, a seat tally instead of a headcount, and
  // the viewer's own place on the pill. A campaign lineup still wins (a private
  // night arrives sealed from lock-in, so `picksLocked` is already true).
  const showPrivate = locked && !showCampaign && privateNight !== null;
  const invitedPending = showPrivate && !isPast && privateNight?.viewerSeat === "invited";
  // "Find a date": a free date that suits the group is ringed and tallied;
  // one that doesn't steps back (still clickable — the admin may want it).
  const groupFit = !locked && group ? group.tier : null;

  // Personal-mark gradient layer — render only when no aggregate heat or lock overrides it.
  // "maybe" stays in the warn tones so it never reads as the heat of warming or fire.
  //
  // COLOR SOURCES: every art color in this file now routes through the
  // semantic/art tokens (`warn-*`, `heat-*`, `sealed-*` — index.css, retuned
  // per theme by lib/theme/semantic.ts). They exist because this art used to
  // be fixed: a Sakura or Terminal palette repainted the whole app and left an
  // orange bonfire burning in the middle of it. The D&D night treatment below
  // stays literal on purpose — crimson-and-gold is that night's identity, not
  // the calendar's palette.
  //
  // Classic shifts a few RGB units here, deliberately. The tokens carry the
  // v3-era hexes this art was tuned against, while the `orange-*`/`red-*`/
  // `yellow-*` classes they replaced resolved to Tailwind v4's OKLCH palette
  // (`--color-orange-500` = oklch(70.5% 0.213 47.604), not #f97316). The move
  // is toward the authored values, not away from them.
  //
  // Glows ride Tailwind's shadow-color utilities (`shadow-[geometry]
  // shadow-warn-gold/55`) so they retheme too. That pair is a TWO-CLASS
  // CONTRACT — keep the halves together: the geometry class resolves its color
  // as `var(--tw-shadow-color, currentcolor)`, so dropping the color half
  // doesn't remove the glow, it silently repaints it in the element's text
  // color (a white-ish smear here, not a missing shadow — easy to miss). Glow
  // geometry stays bespoke (8–10px dot glows): none matches
  // --shadow-glow-accent/-cyan (12px). This gradient layer once carried a
  // 24–30px outer glow as well, but the button's overflow-hidden clipped it
  // entirely — it never painted, so it was deleted, not migrated.
  const personalStateClass =
    showPersonalGradient && value === "can"
      ? "bg-gradient-to-br from-accent-500/40 via-accent-500/20 to-neon-cyan/15"
      : showPersonalGradient && value === "maybe"
        ? "bg-gradient-to-br from-warn-strong/35 via-warn-soft/22 to-warn-soft/10"
        : "";

  const borderClass =
    showCampaign || showPrivate
      ? "" // `.campaign-night-cell` / `.private-night-cell` own their rim + glow.
      : groupFit && groupFit !== "none"
        ? GROUP_RING[groupFit]
        : locked
          ? "border-warn-gold/40"
          : heat.kind === "fire"
            ? "border-heat-ember/80"
            : heat.kind === "warming"
              ? "border-heat-bright/65"
              : value === "can"
                ? "border-accent-400/70"
                : value === "maybe"
                  ? "border-warn-strong/60"
                  : away
                    ? "border-dashed border-fg-muted/50"
                    : lockMode
                      ? "border-warn-gold/30 hover:border-warn-gold/60"
                      : "border-line hover:border-fg-strong/25";

  const baseBgClass = !value && !heated && !locked ? "bg-surface-800/55" : "";
  const baseHover = !value && !heated && !locked && clickable ? "hover:bg-surface-800/80" : "";
  const lockedDisplayClass = isPast
    ? "pointer-events-none opacity-30"
    : groupFit === "none"
      ? "opacity-35 hover:opacity-100"
      : clickable
        ? "hover:scale-[1.015] active:scale-[0.985]"
        : "pointer-events-none";

  // Phones (< sm) draw the cell through `PhoneCellGrid` (below), sized to
  // the cell itself; this padding only frames the admin names layout there.
  // 4px, not 8: at p-2 a ~37px cell left 19px and "20"–"29" overflowed.
  const padding = compact ? "p-1 sm:p-1.5" : "p-1 sm:p-3";
  // Every phone cell except the admin names view runs on the one grid.
  const phoneGrid = !compact && (locked || !isAdminView || groupFit !== null);
  const phoneHide = phoneGrid ? "max-sm:hidden" : "";
  // Size depends on `compact` ALONE. Attendee names only ever render under the
  // admin overlay, so a size that also keyed off "this cell has names" meant
  // every day number visibly resized the instant the admin eye was toggled —
  // the same date, redrawn a step smaller. The names area is `flex-1
  // overflow-hidden`, so it absorbs the difference instead.
  const dayTextSize = compact
    ? "text-sm sm:text-base"
    : "text-lg sm:text-xl md:text-2xl 3xl:text-3xl";
  const monthLabelPos = compact ? "left-1 top-1" : "left-1.5 top-1.5";
  const monthLabelSize = compact ? "text-6xs" : "text-5xs sm:text-3xs";
  const todayDotPos = compact ? "right-1 top-1" : "right-1 top-1 sm:right-2 sm:top-2";
  const aspectClass = compact ? "aspect-square" : "";
  const layoutClass = compact ? "items-center justify-center" : "";

  // Ring/animation per heat state. Lock disables heat animations. Past days never animate.
  const heatAnim =
    isPast || compact || locked
      ? ""
      : heat.kind === "fire"
        ? "motion-safe:animate-fire-breathe"
        : heat.kind === "warming"
          ? "motion-safe:animate-ember-ring"
          : "";

  const dayNumberClass =
    !isPast && !locked && heat.kind === "fire" && !compact ? "motion-safe:animate-heat-haze" : "";

  return (
    <button
      type="button"
      data-tour={tourAnchor}
      onClick={night ? night.onClick : onClick}
      disabled={!clickable || isPast}
      aria-label={`${day}${value ? ` — ${value}` : ""}${away ? " — away (admin note)" : ""}${locked ? " — locked in" : ""}${
        !locked && heat.kind === "warming" ? ` — warming up, ${heat.can} confirmed` : ""
      }${!locked && heat.kind === "fire" ? ` — on fire, ${heat.can} confirmed` : ""}${
        showCampaign && campaign ? ` — ${campaign.night} night` : ""
      }${
        showPrivate && privateNight
          ? ` — private night, ${privateNight.seats.taken} of ${privateNight.seats.total} seats${
              privateNight.viewerSeat && privateNight.viewerSeat !== "outsider"
                ? `, you: ${privateNight.viewerSeat}`
                : ""
            }`
          : ""
      }`}
      aria-pressed={value !== undefined || away}
      data-campaign={showCampaign ? campaign?.slug : undefined}
      title={
        groupFit && group
          ? groupTitle(group)
          : away
            ? "Marked away — not counted in coverage"
            : undefined
      }
      className={`group relative flex flex-col overflow-hidden rounded-card-xl border ${compact ? "" : "max-sm:rounded-card-md"} transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${layoutClass} ${aspectClass} ${padding} ${baseBgClass} ${borderClass} ${showCampaign ? "campaign-night-cell" : ""} ${showPrivate ? "private-night-cell" : ""} ${invitedPending ? "private-night-cell-invited" : ""} ${baseHover} ${lockedDisplayClass} ${heatAnim}`}
    >
      <span
        className={`pointer-events-none absolute inset-0 ${monthTintClass(monthBucket)}`}
        aria-hidden="true"
      />
      {personalStateClass && (
        <span
          className={`pointer-events-none absolute inset-0 ${personalStateClass}`}
          aria-hidden="true"
        />
      )}
      {away && <AwayLayer />}
      {showHeatLayer && heat.kind === "warming" && <WarmingLayer compact={compact} />}
      {showHeatLayer && heat.kind === "fire" && <FireLayer compact={compact} cellSeed={cellSeed} />}
      {locked &&
        (showCampaign ? (
          <CampaignNightLayer compact={compact} viewerRsvp={viewerRsvp} />
        ) : showPrivate && privateNight ? (
          <PrivateNightLayer compact={compact} viewerSeat={privateNight.viewerSeat} />
        ) : (
          <LockedLayer compact={compact} viewerRsvp={viewerRsvp} showMedallion={picksLocked} />
        ))}
      {/* Personal availability stripe — guarantees the user's own can/maybe
          mark stays visible against any background (fire, warming, locked
          gradients all override the cell's base color, so we draw a slim
          color stripe on the leading edge that the heat layers can't drown).
          Mixed on purpose: the `can` glow is tokenized (accent-500); the
          `maybe` glow is a v3-yellow literal that matches no current token —
          don't "unify" the two branches either direction. */}
      {value && !locked && !isAdminView && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 left-0 z-lift w-0.75 sm:w-1.5 ${
            value === "can"
              ? "bg-accent-400 shadow-[0_0_8px] shadow-accent-500/60"
              : "bg-warn-strong shadow-[0_0_8px] shadow-warn-strong/55"
          }`}
        />
      )}
      {monthLabel && (
        <span
          className={`pointer-events-none absolute font-bold uppercase tracking-pill text-fg-strong/40 ${monthLabelPos} ${monthLabelSize} ${phoneHide}`}
          aria-hidden="true"
        >
          {monthLabel}
        </span>
      )}
      {isToday && <TodayDot className={`${todayDotPos} ${phoneHide}`} />}
      {showCampaign && campaign && attendance ? (
        // Campaign night: the game's relic replaces the headcount, the party
        // size painted into it. The grid position still tells you the date.
        <span
          className={`relative z-lift flex min-h-0 flex-1 items-center justify-center p-1 ${phoneHide}`}
        >
          {/* The relic fills whatever space the cell row gives it (rows are
              flex-sized, so they're shorter on a 1080p screen than on 4K) and
              object-fit keeps it centred. Caps keep 4K at the d20's old size;
              shorter rows simply shrink it instead of overflowing the bottom
              edge. */}
          <CampaignRelic
            slug={campaign.slug}
            count={attendance.definite}
            className={`h-full w-full ${
              compact
                ? "max-h-8 max-w-8"
                : "max-h-12 max-w-12 sm:max-h-16 sm:max-w-16 md:max-h-20 md:max-w-20 lg:max-h-22 lg:max-w-22"
            }`}
          />
        </span>
      ) : showPrivate && privateNight ? (
        <SeatTally compact={compact} night={privateNight} className={phoneHide} />
      ) : picksLocked && attendance ? (
        // Picks-locked cell: the day number is dropped — the cell's position
        // in the calendar grid already tells you which date it is. The big
        // centered "definite / definite+tentative" headcount takes over.
        // N1 = RSVP-yes (coming for sure), N2 = N1 plus maybes.
        <span className={`relative flex flex-1 items-center justify-center ${phoneHide}`}>
          <span
            className={`flex items-baseline gap-1 font-extrabold leading-none text-warn-pale drop-shadow ${
              compact ? "text-base" : "text-lg sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl"
            }`}
          >
            <span className="tabular-nums">{attendance.definite}</span>
            <span className="text-warn-pale/60">/</span>
            <span className="tabular-nums">{attendance.definite + attendance.tentative}</span>
          </span>
        </span>
      ) : (
        // Admin names view on phones: the number centred (flex, so even an
        // overflowing number spills evenly both ways).
        <span
          className={`relative font-bold leading-none ${dayTextSize} ${dayNumberClass} ${
            compact
              ? ""
              : "max-sm:flex max-sm:flex-1 max-sm:flex-col max-sm:items-center max-sm:justify-center"
          } ${phoneHide} ${
            value || heated
              ? "text-fg-strong"
              : away
                ? "text-fg-muted line-through"
                : "text-fg-primary"
          }`}
        >
          {day}
        </span>
      )}
      {phoneGrid && (
        <PhoneCellGrid
          day={day}
          monthLabel={monthLabel}
          isToday={isToday}
          hasPills={
            locked ||
            (groupFit !== null ? groupFit !== "none" : (!!value || heated) && !isAdminView)
          }
          main={
            showCampaign && campaign && attendance ? (
              <CampaignRelic
                slug={campaign.slug}
                count={attendance.definite}
                className="h-[54cqw] w-[54cqw]"
              />
            ) : showPrivate && privateNight ? (
              <PhoneTally a={privateNight.seats.taken} b={privateNight.seats.total} />
            ) : picksLocked && attendance ? (
              <PhoneTally a={attendance.definite} b={attendance.definite + attendance.tentative} />
            ) : (
              <span
                className={`${PHONE_NUMBER} font-bold leading-none ${dayNumberClass} ${
                  value || heated
                    ? "text-fg-strong"
                    : away
                      ? "text-fg-muted line-through"
                      : "text-fg-primary"
                }`}
              >
                {day}
              </span>
            )
          }
          pills={
            showPrivate && privateNight ? (
              <PhoneSeatPill viewerSeat={privateNight.viewerSeat} />
            ) : locked ? (
              <PhoneRsvpPill viewerRsvp={viewerRsvp} />
            ) : groupFit !== null && group ? (
              <PhoneGroupPill group={group} />
            ) : (
              <>
                {value && <PhoneMarkPill value={value} />}
                {heated && <PhoneHeatPill heat={heat} />}
              </>
            )
          }
        />
      )}
      {labels && labels.length > 0 && !compact && !locked && (
        <DayLabels entries={labels} heated={heated} className={phoneHide} />
      )}
      {groupFit && group && groupFit !== "none" && !compact && (
        // lg+ only, in the free top-right corner: below that a cell has no
        // room to spare without hiding a name, and the ring says enough.
        <span className="pointer-events-none absolute top-1.5 right-1.5 z-raised hidden lg:inline-flex">
          <GroupBadge group={group} />
        </span>
      )}
      {/* sm+: pinned to opposite corners, stable slots regardless of which
          badge is present. */}
      {!compact && !locked && !isAdminView && value && (
        <span className="pointer-events-none absolute z-raised hidden sm:bottom-1.5 sm:left-2 sm:inline-flex">
          <PersonalMarkChip value={value} />
        </span>
      )}
      {!compact && !locked && !isAdminView && heated && (
        <span className="pointer-events-none absolute z-raised hidden sm:right-2 sm:bottom-1.5 sm:inline-flex">
          <HeatBadge heat={heat} />
        </span>
      )}
      {/* Admin overlay shows the names panel and hides the personal footer —
          surface the viewer's own mark as a small chip so admins can still
          see what they marked without dropping back to player view. */}
      {!compact && !locked && isAdminView && value && (
        <span className="pointer-events-none absolute right-1.5 bottom-1.5 z-raised">
          <PersonalMarkChip value={value} />
        </span>
      )}
    </button>
  );
}

function WarmingLayer({ compact }: { compact: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-heat-deep/45 via-heat/30 to-heat-bright/15 shadow-[inset_0_-12px_18px_-12px] shadow-heat-bright/50"
      />
      {!compact && (
        <>
          <span
            className="ember"
            style={
              {
                "--x": "20%",
                "--delay": "0s",
                "--dur": "3.4s",
                "--drift": "-3px",
              } as React.CSSProperties
            }
          />
          <span
            className="ember"
            style={
              {
                "--x": "55%",
                "--delay": "0.9s",
                "--dur": "3s",
                "--drift": "2px",
              } as React.CSSProperties
            }
          />
          <span
            className="ember"
            style={
              {
                "--x": "82%",
                "--delay": "1.6s",
                "--dur": "3.6s",
                "--drift": "-1px",
              } as React.CSSProperties
            }
          />
        </>
      )}
    </>
  );
}

function FireLayer({ compact, cellSeed }: { compact: boolean; cellSeed: number }) {
  // Independent phase offsets per layer (seeded by cell) so neighboring cells
  // never pulse in lockstep AND layers within one cell drift relative to each
  // other. Negative `animation-delay` starts the layer mid-cycle.
  const phaseBloom = (cellSeed * 0.37) % 3.4;
  const phaseLeft = (cellSeed * 0.71) % 2.1;
  const phaseRight = (cellSeed * 0.53) % 2.7;
  const phaseGlow = (cellSeed * 0.91) % 4.3;
  const phaseEmber = (cellSeed * 0.17) % 3.6;

  return (
    <>
      {/* Molten base — warm static gradient, fades to transparent at the top so
          there's no hard horizon line. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-heat-molten/85 via-heat-deep/40 to-transparent"
      />
      {/* Heart of the fire — soft radial dome at the bottom, breathes. */}
      <span
        aria-hidden="true"
        className="pointer-events-none fire-bloom absolute inset-0 motion-safe:animate-fire-bloom"
        style={{ animationDelay: `-${phaseBloom}s` } as React.CSSProperties}
      />
      {/* Asymmetric flame petals — left and right blobs on different periods. */}
      <span
        aria-hidden="true"
        className="pointer-events-none fire-petal-left absolute inset-0 motion-safe:animate-fire-petal-left"
        style={{ animationDelay: `-${phaseLeft}s` } as React.CSSProperties}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none fire-petal-right absolute inset-0 motion-safe:animate-fire-petal-right"
        style={{ animationDelay: `-${phaseRight}s` } as React.CSSProperties}
      />
      {/* Outer rim glow — soft inset shadows, slow breathe. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 motion-safe:animate-fire-glow shadow-[inset_0_-22px_28px_-12px_color-mix(in_srgb,var(--color-heat-bright)_55%,transparent),inset_0_0_22px_-10px_color-mix(in_srgb,var(--color-heat-ember)_50%,transparent)]"
        style={{ animationDelay: `-${phaseGlow}s` } as React.CSSProperties}
      />
      {!compact && (
        <>
          <span
            className="ember"
            style={
              {
                "--x": "22%",
                "--delay": `-${phaseEmber}s`,
                "--dur": "3.4s",
                "--drift": "-4px",
              } as React.CSSProperties
            }
          />
          <span
            className="ember"
            style={
              {
                "--x": "55%",
                "--delay": `-${(phaseEmber + 1.3) % 3.6}s`,
                "--dur": "3.8s",
                "--drift": "2px",
              } as React.CSSProperties
            }
          />
          <span
            className="ember"
            style={
              {
                "--x": "78%",
                "--delay": `-${(phaseEmber + 2.4) % 3.6}s`,
                "--dur": "3.1s",
                "--drift": "-2px",
              } as React.CSSProperties
            }
          />
        </>
      )}
    </>
  );
}

function LockedLayer({
  compact,
  viewerRsvp,
  showMedallion,
  pane = false,
}: {
  compact: boolean;
  viewerRsvp?: RsvpStatus;
  /** Wax-seal medallion now signals "guest list is sealed" specifically —
   * shown only when picks are locked, not just when the date is locked-in. */
  showMedallion: boolean;
  /** Painting one pane of a split cell: corner medallion, container-sized pill. */
  pane?: boolean;
}) {
  return (
    <>
      {/* Deep regal base — feels weighty. No animation on the bg itself. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sealed-base via-sealed-mid/95 to-sealed-edge shadow-[inset_0_0_24px_-8px_rgba(0,0,0,0.6),0_0_24px_-6px_color-mix(in_srgb,var(--color-warn)_25%,transparent)]"
      />
      {/* Faint gold ring for the "sealed" feel. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 ring-1 ring-warn-gold/35 ${pane ? "rounded-card-md" : "rounded-card-xl max-sm:rounded-card-md"}`}
      />
      {/* Slow diagonal shimmer — light catching the seal. Idle most of cycle. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 -left-1/4 w-1/3 bg-gradient-to-r from-transparent via-warn-gold/25 to-transparent motion-safe:animate-seal-shimmer"
      />
      {/* Wax-seal medallion + compact lock pip — visible only when picks are
          locked, communicating "guest list is sealed" rather than the date
          itself being chosen. Centered along the top edge so the medallion
          sits symmetrically above the headcount on both phone and desktop. */}
      {showMedallion && <SealMedallion variant={medallionVariant(compact, pane)} />}
      {/* RSVP-aware pill: invitation by default; flips to GOING / PASS once viewer commits. */}
      {pane ? (
        <>
          <LockedPill viewerRsvp={viewerRsvp} pane />
          <PaneStatusEdge tone={rsvpTone(viewerRsvp)} />
        </>
      ) : (
        !compact && <LockedPill viewerRsvp={viewerRsvp} />
      )}
    </>
  );
}

function medallionVariant(compact: boolean, pane: boolean): MedallionVariant {
  return pane ? "pane" : compact ? "compact" : "full";
}

/**
 * The wax-seal lock medallion, centered on the top edge. On an open night it
 * means "guest list sealed"; a private night's guest list is sealed by
 * construction, so it wears the same seal from day one — one lock, one
 * meaning.
 */
type MedallionVariant = "full" | "compact" | "pane";

function SealMedallion({ variant }: { variant: MedallionVariant }) {
  if (variant === "pane") {
    // A split cell's pane: centred on the top edge like the cell's own seal,
    // sized by the pane itself (see `.night-pane-medallion`).
    return (
      <span
        aria-hidden="true"
        className="night-pane-medallion pointer-events-none absolute z-raised flex items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-yellow-500 to-amber-700 shadow-sm"
      >
        <LockGlyph small />
      </span>
    );
  }
  return variant === "compact" ? (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-0.5 z-raised flex h-3 w-3 -translate-x-1/2 items-center justify-center rounded-full bg-amber-400 shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
    >
      <LockGlyph small />
    </span>
  ) : (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1.5 z-raised flex h-6 w-6 -translate-x-1/2 max-sm:hidden items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-yellow-500 to-amber-700 shadow-[0_2px_8px_rgba(0,0,0,0.5),inset_0_1px_2px_rgba(255,255,255,0.4),inset_0_-2px_3px_rgba(0,0,0,0.3)]"
    >
      <LockGlyph />
    </span>
  );
}

/**
 * Background treatment for a sealed campaign night — swapped in for
 * `LockedLayer`. The game's base colour fading to black with central light, a
 * gilt hairline + shimmer, and drifting embers, all in the game's colours (the
 * cell's `data-campaign`, campaign-night.css). The rim + the relic headcount
 * (painted by the cell itself) carry the identity — no explicit label needed.
 * This layer is everything behind them.
 */
function CampaignNightLayer({
  compact,
  viewerRsvp,
  pane = false,
}: {
  compact: boolean;
  viewerRsvp?: RsvpStatus;
  pane?: boolean;
}) {
  return (
    <>
      {/* The game's base, fading to black. */}
      <span
        aria-hidden="true"
        className="campaign-night-base pointer-events-none absolute inset-0"
      />
      {/* Light rising from the center, behind the relic. */}
      <span
        aria-hidden="true"
        className="campaign-night-torch pointer-events-none absolute inset-0"
      />
      {/* Gilt inner hairline — the edge of a sealed tome. */}
      <span
        aria-hidden="true"
        className={`campaign-night-gilt pointer-events-none absolute inset-0 ${pane ? "rounded-card-md" : "rounded-card-xl max-sm:rounded-card-md"}`}
      />
      {/* Slow shimmer sweep (shared with the locked wax-seal cell). */}
      <span
        aria-hidden="true"
        className="campaign-night-shimmer pointer-events-none absolute inset-y-0 -left-1/4 w-1/3 motion-safe:animate-seal-shimmer"
      />
      {/* Torch embers drifting up. Desktop cells only — phones have no room. */}
      {!compact && (
        <>
          <span
            className="ember"
            style={
              {
                "--x": "26%",
                "--delay": "0s",
                "--dur": "3.6s",
                "--drift": "-3px",
              } as React.CSSProperties
            }
          />
          <span
            className="ember"
            style={
              {
                "--x": "72%",
                "--delay": "1.5s",
                "--dur": "3.1s",
                "--drift": "2px",
              } as React.CSSProperties
            }
          />
        </>
      )}
      {/* RSVP-aware pill: invitation by default; flips to GOING / PASS. */}
      {pane ? (
        <>
          <LockedPill viewerRsvp={viewerRsvp} pane />
          <PaneStatusEdge tone={rsvpTone(viewerRsvp)} />
        </>
      ) : (
        !compact && <LockedPill viewerRsvp={viewerRsvp} />
      )}
    </>
  );
}

// Phone cells are ~50px wide. The pill sits at the bottom with a small
// horizontal inset; the inline-flex BG would otherwise be capped at that
// width and the wider tracking would push the label out of the green
// outline. Tighter tracking + smaller mobile font keeps "GOING" / "PASS"
// / "RSVP" inside the pill on every device.
//
// `min-h-3 sm:min-h-5` matches the heights of PersonalMarkChip and
// HeatBadge, so locked vs. unlocked cells render at the same vertical
// mass — otherwise the chips' default leading + ring made them taller
// than the locked pill and adjacent cells looked staggered.
//
// The bracketed letter-spacing below is a deliberate hold-out from the
// tracking-label/pill/eyebrow token scale (pinned in scripts/style-baseline.json).
// These glyphs are 7px (`text-6xs`) inside a pill only a few px wider: the
// spacing is per-breakpoint optical tuning to stop "RSVP" overflowing its own
// pill, not the label-typography role the tokens describe. Applying the pill
// token (0.18em) at the phone size overflows the cell.
// Phones draw their own pill (PhoneCellGrid), hence `max-sm:hidden`.
const cellPillBase =
  "pointer-events-none absolute max-sm:hidden inset-x-1 bottom-1 z-raised inline-flex min-h-3 items-center justify-center gap-0.5 rounded-card-md px-0.5 py-0 text-6xs font-bold uppercase leading-none tracking-[0.1em] backdrop-blur-sm sm:inset-x-2 sm:bottom-1.5 sm:min-h-5 sm:gap-1 sm:px-1 sm:py-0.5 sm:text-5xs sm:tracking-pill";

// A split cell's pane sizes its pill from ITS OWN box, not the viewport:
// `.night-pane-pill` hides it below a workable pane size (the status edge
// takes over) and grows it once the pane is wide (calendar-fire.css).
const panePillBase =
  "night-pane-pill pointer-events-none absolute inset-x-0.5 bottom-0.5 z-raised min-h-3 items-center justify-center gap-0.5 rounded-card-md px-0.5 py-0 text-6xs font-bold uppercase leading-none tracking-label backdrop-blur-sm";

/**
 * Background treatment for a private night — frosted graphite under a
 * platinum hairline. Deliberately the ONLY cool, unsaturated tile in the
 * grid: the gold seal, the crimson tome and the orange fire all read as
 * "something is on"; this one reads as "a door is closed". The diagonal
 * hatch (`.private-night-hatch`) is the frost — you can tell the room is
 * taken, not who is in it.
 */
function PrivateNightLayer({
  compact,
  viewerSeat,
  pane = false,
}: {
  compact: boolean;
  viewerSeat: ViewerSeat | null;
  pane?: boolean;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-private-base via-private-mid to-private-edge"
      />
      <span
        aria-hidden="true"
        className="private-night-hatch pointer-events-none absolute inset-0"
      />
      {/* Platinum inner hairline. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 ring-1 ring-private-ink/25 ${pane ? "rounded-card-md" : "rounded-card-xl max-sm:rounded-card-md"}`}
      />
      {/* The same slow shimmer the sealed cell has, in cold light. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 -left-1/4 w-1/3 bg-gradient-to-r from-transparent via-private-ink/15 to-transparent motion-safe:animate-seal-shimmer"
      />
      <SealMedallion variant={medallionVariant(compact, pane)} />
      {pane ? (
        <>
          <PrivateSeatPill viewerSeat={viewerSeat} pane />
          <PaneStatusEdge tone={seatTone(viewerSeat)} />
        </>
      ) : (
        !compact && <PrivateSeatPill viewerSeat={viewerSeat} />
      )}
    </>
  );
}

/**
 * The private night's centre: seats taken over seats total, set exactly like
 * the sealed cell's headcount (same scale, same cream ink) so a locked-in
 * night reads the same way whether it is open or private. The waitlist rides
 * along as a small "+n" — the only thing an open night doesn't have.
 */
function SeatTally({
  compact,
  night,
  pane = false,
  className = "",
}: {
  compact: boolean;
  night: PrivateNightCell;
  pane?: boolean;
  className?: string;
}) {
  const { seats } = night;
  if (pane) return <PaneHeadcount a={seats.taken} b={seats.total} extra={seats.waitlisted} />;
  return (
    <span className={`relative z-lift flex flex-1 items-center justify-center ${className}`}>
      <span
        className={`flex items-baseline gap-1 font-extrabold leading-none text-warn-pale drop-shadow ${
          compact ? "text-base" : "text-lg sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl"
        }`}
      >
        <span className="tabular-nums">{seats.taken}</span>
        <span className="text-warn-pale/60">/</span>
        <span className="tabular-nums">{seats.total}</span>
        {seats.waitlisted > 0 && !compact && (
          <span
            title={`${seats.waitlisted} waiting for a seat`}
            className="ml-0.5 self-center text-4xs font-semibold tabular-nums text-warn-pale/60 sm:text-3xs md:text-xs"
          >
            +{seats.waitlisted} waiting
          </span>
        )}
      </span>
    </span>
  );
}

/** The private cell's bottom pill: the viewer's own place on the guest list. */
function PrivateSeatPill({
  viewerSeat,
  pane = false,
}: {
  viewerSeat: ViewerSeat | null;
  pane?: boolean;
}) {
  const pillBase = pane ? panePillBase : cellPillBase;
  switch (viewerSeat) {
    case "host":
      return (
        <span
          aria-hidden="true"
          className={`${pillBase} border border-private-ink/40 bg-private-ink/15 text-private-ink`}
        >
          Hosting
        </span>
      );
    case "seated":
      return (
        <span
          aria-hidden="true"
          className={`${pillBase} border border-ok/45 bg-ok-strong/15 text-ok`}
        >
          <CheckGlyphSmall />
          Seated
        </span>
      );
    case "waitlisted":
      return (
        <span
          aria-hidden="true"
          className={`${pillBase} border border-warn-gold/45 bg-warn-gold/10 text-warn-gold`}
        >
          Waitlist
        </span>
      );
    case "invited":
      return (
        <span
          aria-hidden="true"
          className={`${pillBase} border border-accent-400/60 bg-accent-500/20 text-accent-200 motion-safe:animate-pulse-soft`}
        >
          Invited
        </span>
      );
    case "declined":
      return (
        <span
          aria-hidden="true"
          className={`${pillBase} border border-line bg-fill-soft text-fg-secondary`}
        >
          <CrossGlyphSmall />
          Pass
        </span>
      );
    default:
      return (
        <span
          aria-hidden="true"
          className={`${pillBase} border border-private-ink/20 bg-private-base/60 text-private-ink/60`}
        >
          Private
        </span>
      );
  }
}

function LockedPill({ viewerRsvp, pane = false }: { viewerRsvp?: RsvpStatus; pane?: boolean }) {
  const pillBase = pane ? panePillBase : cellPillBase;
  if (viewerRsvp === "yes") {
    return (
      <span
        aria-hidden="true"
        className={`${pillBase} border border-ok/45 bg-ok-strong/15 text-ok motion-safe:animate-pulse-soft`}
      >
        <CheckGlyphSmall />
        Going
      </span>
    );
  }
  if (viewerRsvp === "no") {
    return (
      <span
        aria-hidden="true"
        className={`${pillBase} border border-line bg-fill-soft text-fg-secondary`}
      >
        <CrossGlyphSmall />
        Pass
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${pillBase} border border-warn-gold/45 bg-warn-gold/10 text-center text-warn-gold motion-safe:animate-pulse-soft`}
    >
      RSVP
    </span>
  );
}

function CheckGlyphSmall() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-2.5 w-2.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}

function CrossGlyphSmall() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-2.5 w-2.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function LockGlyph({ small = false }: { small?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`text-amber-950 ${small ? "h-2 w-2" : "h-3 w-3"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={small ? 3 : 2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function PersonalMarkChip({ value }: { value: Availability }) {
  const isCan = value === "can";
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none inline-flex min-h-3 items-center gap-0.5 rounded-full bg-surface-950/95 px-1 py-0 text-6xs font-extrabold uppercase leading-none tracking-[0.1em] text-fg-strong ring-1 sm:min-h-5 sm:gap-1 sm:px-2 sm:py-0.5 sm:text-3xs sm:tracking-[0.15em] md:text-xs ${
        isCan
          ? "ring-accent-300 shadow-[0_0_10px] shadow-accent-400/60"
          : "ring-warn-gold shadow-[0_0_10px] shadow-warn-gold/55"
      }`}
    >
      <span
        className={`inline-block h-1 w-1 shrink-0 rounded-full sm:h-1.5 sm:w-1.5 ${isCan ? "bg-accent-300" : "bg-warn-gold"}`}
      />
      {value}
    </span>
  );
}

// ── Phone cell grid ──────────────────────────────────────────────────────
//
// Below `sm` every day cell — open, marked, heated, locked, private, D&D —
// is drawn by ONE layout sized in container units (`cqw` = 1% of the cell's
// own width), so the whole cell scales as a single design from Simon's 320px
// screen (~37px cells) to a 430px phone (~52px):
//
//   ┌──────────────┐  month tag along the top, today dot in the corner
//   │      14      │  ← main slot: the day, or the headcount, seats or die,
//   │              │    centred in what the band leaves
//   │   ·MAYBE     │  ← status band, RESERVED in every cell (60cqw) so the
//   │   🔥3·1m     │    main slot — and the numbers in a row — line up
//   └──────────────┘
//
// One pill family (`PhonePill`) for every status: same height, type size
// and padding whether it reads MAYBE, 🔥4, GOING or WAITLIST. Pills stack
// from the bottom, so a single pill always sits on the bottom line.
// Desktop keeps its own layout; this replaces only the phone rendering. The
// wax seal stays desktop-only: at 320px it sat on the headcount, and the
// headcount itself already says the guest list is sealed.

function PhoneCellGrid({
  day,
  monthLabel,
  isToday,
  main,
  pills,
  hasPills,
}: {
  day: number;
  monthLabel: string | null;
  isToday: boolean;
  main: ReactNode;
  pills: ReactNode;
  hasPills: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      data-day={day}
      className="@container pointer-events-none absolute inset-0 z-raised flex flex-col sm:hidden"
    >
      {monthLabel && (
        <span className="absolute inset-x-0 top-[6cqw] text-center text-[11cqw] font-bold uppercase leading-none tracking-label text-fg-strong/50">
          {monthLabel}
        </span>
      )}
      {isToday && (
        <span className="absolute right-[10cqw] top-[10cqw] size-[8cqw] animate-pulse rounded-full bg-neon-cyan shadow-[0_0_6px_1px] shadow-neon-cyan/70" />
      )}
      <span className="flex min-h-0 flex-1 items-center justify-center pt-[6cqw]">{main}</span>
      {/* (The band below is `relative` so it paints ABOVE this absolute
          tray — as a plain flow box the tray dimmed every bottom pill.)
          A soft dark tray under the pills: fire glow, gold and violet bottoms
          otherwise changed how far the pills seemed to sit from the edge. */}
      {hasPills && (
        <span className="absolute inset-x-0 bottom-0 h-[70cqw] bg-gradient-to-t from-surface-950/60 via-surface-950/25 to-transparent" />
      )}
      {/* Two pill slots, always reserved: 2 × 22 + 8 gap + 8 below, each
          rounded to whole pixels — and the band is the exact SUM of those
          rounded parts (rounding the total separately came out a pixel
          short, and flexbox squeezed stacked pills to half-pixel heights) —
          so the upper and lower slot sit at the same pixel phase (and a pill's width stays even, so it centres exactly
          in the even-width cell). The gap
          clears both rings and halos (stacked pills used to touch), the 8
          below clears the cell's corner curve. */}
      <span className="relative flex h-[calc(2*round(22cqw,1px)+round(8cqw,1px)+round(8cqw,1px))] shrink-0 flex-col items-center justify-end gap-[round(8cqw,1px)] pb-[round(8cqw,1px)]">
        {pills}
      </span>
    </span>
  );
}

/** The phone headcount: "5/6", the day's place taken by who is coming.
 * Set exactly like the day number (`PHONE_NUMBER`) so a row reads as one
 * line of type; only a two-digit pair ("10/12") steps down to fit. A
 * private night's waitlist is left to the viewer's own QUEUED pill. */
function PhoneTally({ a, b }: { a: number; b: number }) {
  const long = `${a}/${b}`.length > 4;
  return (
    <span
      className={`flex items-baseline font-bold leading-none tabular-nums text-warn-pale ${
        long ? "text-[28cqw]" : PHONE_NUMBER
      }`}
    >
      {a}
      <span className="mx-[1cqw] text-warn-pale/55">/</span>
      {b}
    </span>
  );
}

/** The phone day number's type — shared by the headcounts. */
const PHONE_NUMBER = "text-[38cqw]";

type PhonePillTone =
  | "can"
  | "maybe"
  | "fire"
  | "warming"
  | "ok"
  | "muted"
  | "gold"
  | "accent"
  | "private"
  | "match";

const PHONE_PILL_TONE: Record<PhonePillTone, string> = {
  can: "bg-surface-950/90 text-accent-200 ring-accent-300/55",
  maybe: "bg-surface-950/90 text-warn-gold ring-warn-gold/55",
  fire: "bg-surface-950/90 text-heat-glow ring-heat-glow/55",
  warming: "bg-surface-950/90 text-warn-soft ring-warn-gold/55",
  ok: "bg-surface-950/80 text-ok ring-ok/50",
  muted: "bg-surface-950/80 text-fg-secondary ring-line-strong",
  gold: "bg-surface-950/80 text-warn-gold ring-warn-gold/50",
  accent: "bg-surface-950/80 text-accent-200 ring-accent-400/60",
  private: "bg-surface-950/80 text-private-ink ring-private-ink/40",
  match: "bg-surface-950/80 text-ok ring-ok/55",
};

function PhonePill({
  tone,
  pulse = false,
  children,
}: {
  tone: PhonePillTone;
  pulse?: boolean;
  children: ReactNode;
}) {
  // One lean pill for every status: a hairline ring, bold (not extra-bold)
  // caps, 74% of the cell wide — clear of the 3px mark stripe by 3px — and
  // 22% tall. Every text run is trimmed to its capital letters (`CAP`), so
  // flex centring centres the letters themselves.
  return (
    <span
      className={`${PILL_METRICS} inline-flex h-(--pill-h) w-[round(74cqw,2px)] shrink-0 items-center justify-center rounded-full text-(length:--pill-fs) font-bold uppercase [font-kerning:normal] leading-none tabular-nums ring-1 ${
        PHONE_PILL_TONE[tone]
      } ${pulse ? "motion-safe:animate-pulse-soft" : ""}`}
    >
      <span className="inline-flex items-center gap-[2.5cqw]">
        {Children.map(children, (child) =>
          typeof child === "string" || typeof child === "number" ? (
            <span className={CAP}>{child}</span>
          ) : (
            child
          ),
        )}
      </span>
    </span>
  );
}

/**
 * The pill's type metrics, all on whole pixels: height and font size are
 * rounded, the cap height follows from Inter's (1490/2048 em).
 *
 * Why the baseline needs `--pill-shift`: Blink lays the text's baseline on a
 * whole CSS pixel. Centred in the pill, the ideal baseline sits at
 * (height + cap height) / 2 from the top — e.g. 5.82px in an 8px pill with
 * 5px type — so the letters landed up to ½px off, high in one pill size and
 * low in the next. Measured at seven phone widths, the drawn offset matched
 * round(baseline) − baseline to 0.02px; the shift adds that difference back.
 */
const PILL_METRICS =
  "[--pill-h:round(22cqw,1px)] [--pill-fs:round(13cqw,1px)] [--pill-base:calc((var(--pill-h)+var(--pill-fs)*0.7275)/2)] [--pill-shift:calc(var(--pill-base)-round(nearest,var(--pill-base),1px))]";

/**
 * Trim a text run to cap height so flex centring centres the letters
 * themselves, then apply the baseline shift above. Browsers without
 * `text-box` (Chromium < 133, Safari < 18.2) get the font-metric offset
 * measured for them instead.
 */
const CAP =
  "[text-box:trim-both_cap_alphabetic] translate-y-(--pill-shift) supports-[not(text-box:trim-both_cap_alphabetic)]:translate-y-[0.045em]";

function PhoneMarkPill({ value }: { value: Availability }) {
  return <PhonePill tone={value}>{value}</PhonePill>;
}

function PhoneHeatPill({ heat }: { heat: Heat }) {
  if (heat.kind === "neutral") return null;
  const isFire = heat.kind === "fire";
  return (
    <PhonePill tone={isFire ? "fire" : "warming"}>
      <FlameGlyph filled={isFire} tight className="h-[12cqw] w-[8.64cqw] shrink-0" />
      {heat.can}
      {heat.maybe > 0 && <span className={`normal-case opacity-70 ${CAP}`}>·{heat.maybe}m</span>}
    </PhonePill>
  );
}

function PhoneRsvpPill({ viewerRsvp }: { viewerRsvp?: RsvpStatus }) {
  if (viewerRsvp === "yes")
    return (
      <PhonePill tone="ok" pulse>
        Going
      </PhonePill>
    );
  if (viewerRsvp === "no") return <PhonePill tone="muted">Pass</PhonePill>;
  return (
    <PhonePill tone="gold" pulse>
      RSVP
    </PhonePill>
  );
}

function PhoneSeatPill({ viewerSeat }: { viewerSeat: ViewerSeat | null }) {
  switch (viewerSeat) {
    case "host":
      return <PhonePill tone="private">Host</PhonePill>;
    case "seated":
      return <PhonePill tone="ok">Seated</PhonePill>;
    case "waitlisted":
      // "Waitlist" outgrows the one pill width; same meaning, six letters.
      return <PhonePill tone="gold">Queued</PhonePill>;
    case "invited":
      return (
        <PhonePill tone="accent" pulse>
          Invited
        </PhonePill>
      );
    case "declined":
      return <PhonePill tone="muted">Pass</PhonePill>;
    default:
      return <PhonePill tone="private">Private</PhonePill>;
  }
}

// ── "Find a date" ──────────────────────────────────────────────────────

/** The ring a date that suits the group wears — inset, since the cell clips outer glows. */
const GROUP_RING: Record<"all" | "most", string> = {
  all: "border-ok/80 ring-1 ring-inset ring-ok/45",
  most: "border-warn-gold/70 ring-1 ring-inset ring-warn-gold/30",
};

function groupTitle(group: GroupCell): string {
  if (group.missing.length === 0) {
    return group.maybe > 0
      ? `All ${group.total} free (${group.maybe} maybe)`
      : `All ${group.total} free`;
  }
  return `Missing: ${group.missing.join(", ")}`;
}

/** "4/4", with a gold dot when some of them are only maybes. */
function PhoneGroupPill({ group }: { group: GroupCell }) {
  if (group.tier === "none") return null;
  return (
    <PhonePill tone={group.tier === "all" ? "match" : "gold"}>
      {`${group.available}/${group.total}`}
      {group.maybe > 0 && (
        <span className="size-[5cqw] shrink-0 rounded-full bg-warn-strong" aria-hidden="true" />
      )}
    </PhonePill>
  );
}

function GroupBadge({ group }: { group: GroupCell }) {
  const all = group.tier === "all";
  // Sized like PersonalMarkChip / HeatBadge, its desktop siblings.
  return (
    <span
      className={`inline-flex min-h-5 items-center gap-1 rounded-full bg-surface-950/95 px-2 py-0.5 text-3xs font-extrabold leading-none tabular-nums ring-1 md:text-xs ${
        all ? "text-ok ring-ok/70" : "text-warn-gold ring-warn-gold/70"
      }`}
      aria-hidden="true"
    >
      {group.available}/{group.total}
      {group.maybe > 0 && <span className="size-1.5 rounded-full bg-warn-strong" />}
    </span>
  );
}

function HeatBadge({ heat }: { heat: Heat }) {
  if (heat.kind === "neutral") return null;
  const isFire = heat.kind === "fire";
  // Sizing intentionally mirrors PersonalMarkChip so the two badges read as
  // a matched pair when both are present and don't change weight when only
  // one is shown.
  return (
    <span
      className={`pointer-events-none inline-flex min-h-3 items-center gap-0.5 rounded-full bg-surface-950/95 px-1 py-0 text-6xs font-extrabold leading-none ring-1 sm:min-h-5 sm:gap-1 sm:px-2 sm:py-0.5 sm:text-3xs md:text-xs ${
        isFire
          ? "text-heat-glow ring-heat-bright/70 shadow-[0_0_10px] shadow-heat/55"
          : "text-warn-soft ring-warn-gold/70 shadow-[0_0_10px] shadow-warn-gold/40"
      }`}
      aria-hidden="true"
    >
      <FlameGlyph filled={isFire} className="h-1.5 w-1.5" />
      {heat.can}
      {heat.maybe > 0 && <span className="opacity-70">·{heat.maybe}m</span>}
    </span>
  );
}

function FlameGlyph({
  filled,
  className = "h-2.5 w-2.5",
  tight = false,
}: {
  filled: boolean;
  className?: string;
  /** Crop the box to the flame's ink (x 3–10.5, y 1.5–12.5, plus the outline
   * stroke's half-width): the 16-unit box leaves 3 units free on the left and
   * 5.5 on the right, which pushed "🔥 3" off-centre in a centred pill. */
  tight?: boolean;
}) {
  return (
    <svg
      viewBox={tight ? "2.25 0.75 9 12.5" : "0 0 16 16"}
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.5}
      aria-hidden="true"
    >
      <path d="M8 1.5c0 2.5-3 3.2-3 6 0 1.4 1 2.7 2.2 3.1-.5-.5-.7-1.1-.7-1.7 0-1.6 1.6-2.1 1.6-3.7 1.3 1.4 2.4 2.4 2.4 4.1 0 1.7-1.4 3.2-3.5 3.2C5 12.5 3 10.7 3 8.3 3 4.8 8 4 8 1.5z" />
    </svg>
  );
}

function DayLabels({
  entries,
  heated,
  className = "",
}: {
  entries: AvailabilityEntry[];
  heated: boolean;
  className?: string;
}) {
  // Cans always come first so the can row is on top, maybes underneath.
  // No explicit cap: with the responsive font scale the cell can carry every
  // name in the friend group, and the wrapper's `overflow-hidden` is the
  // safety net for the rare oversized case — we don't render a ragged
  // "+N" pill any more.
  const cans = entries.filter((e) => e.status === "can");
  const maybes = entries.filter((e) => e.status === "maybe");
  const textShadow = heated ? { textShadow: "0 1px 2px rgba(0,0,0,0.85)" } : undefined;
  return (
    <div
      className={`relative z-raised mt-0.5 flex min-h-0 flex-1 flex-col overflow-hidden tall:mt-1.5 tall:gap-1.5 ${className}`}
    >
      {cans.length > 0 && (
        <NameRow entries={cans} dotColor="bg-accent-300" textShadow={textShadow} />
      )}
      {maybes.length > 0 && (
        <NameRow entries={maybes} dotColor="bg-warn-strong" textShadow={textShadow} />
      )}
    </div>
  );
}

function NameRow({
  entries,
  dotColor,
  textShadow,
}: {
  entries: AvailabilityEntry[];
  dotColor: string;
  textShadow: React.CSSProperties | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-0.5 gap-y-0 sm:gap-x-1 sm:gap-y-0.5 3xl:gap-x-1.5 3xl:gap-y-1 tall:flex-col tall:flex-nowrap tall:items-start tall:gap-y-0.5">
      {entries.map((e) => (
        <span
          key={e.userId}
          title={`${e.name} — ${e.status}`}
          style={textShadow}
          className="inline-flex max-w-full items-center gap-0 truncate text-7xs font-medium leading-tight text-fg-strong sm:gap-1 sm:text-3xs sm:leading-none md:text-2xs lg:text-xs 3xl:text-base 3xl:leading-snug tall:gap-1.5 tall:text-base tall:leading-snug"
        >
          <span
            aria-hidden="true"
            className={`inline-block h-0.5 w-0.5 shrink-0 rounded-full sm:h-1.5 sm:w-1.5 md:h-2 md:w-2 3xl:h-2.5 3xl:w-2.5 tall:h-2.5 tall:w-2.5 ${dotColor}`}
          />
          <span className="truncate">{firstName(e.name)}</span>
        </span>
      ))}
    </div>
  );
}

function monthTintClass(bucket: 0 | 1 | 2): string {
  if (bucket === 0) return "bg-accent-500/[0.06]";
  if (bucket === 1) return "bg-neon-cyan/[0.06]";
  return "bg-neon-purple/[0.06]";
}

// Admin "away" note (the per-member drawer only): a hatched blank, so a day
// the member is known to be unavailable on reads apart from "hasn't opened
// the calendar". Drawn with the strong-ink token so it survives every theme.
function AwayLayer() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 opacity-70"
      style={{
        backgroundImage:
          "repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-fg-strong) 9%, transparent) 0 3px, transparent 3px 9px)",
      }}
    />
  );
}

// ── Two nights on one date ─────────────────────────────────────────────
//
// The cell becomes a frame around two panes, one per night, each painted
// with that night's own treatment (gold seal / crimson tome / frosted
// graphite), its own headcount, its own pill and its own click. Which way
// the panes stack is decided by the CELL'S SHAPE, not the viewport — a wide
// desktop cell splits left / right, a tall phone cell top / bottom — and
// each pane sizes its numerals, medallion and pill from its own box, so a
// cramped pane sheds the pill for a status edge instead of overflowing. The
// container queries doing that live in calendar-fire.css (`.night-*`).

function SplitDayCell({
  tourAnchor,
  day,
  monthBucket,
  monthLabel,
  isToday,
  isPast,
  compact,
  nights,
  addNight,
  lockMode,
  group = null,
}: DayCellProps) {
  // A date that already has a night: only its ring says how it suits the group.
  const groupRing =
    group && group.tier !== "none"
      ? GROUP_RING[group.tier]
      : lockMode
        ? "border-warn-gold/30"
        : "border-warn-gold/25";
  const inset = compact ? "inset-0.5" : "inset-0.5 sm:inset-1";
  const two = nights.length >= 2;
  return (
    // A fieldset (the semantic "group"): preflight zeroes its margin, padding
    // and border, so it lays out exactly like the one-night cell's button.
    <fieldset
      data-tour={tourAnchor}
      aria-label={`${day} — ${two ? "two nights" : "one night, one free slot"}`}
      className={`group relative min-w-0 overflow-hidden rounded-card-xl border transition-all duration-200 ease-out ${
        compact ? "aspect-square" : ""
      } ${groupRing} ${
        isPast
          ? "pointer-events-none opacity-30"
          : group?.tier === "none"
            ? "opacity-35 hover:opacity-100"
            : ""
      }`}
      title={group ? groupTitle(group) : undefined}
    >
      <span
        className={`pointer-events-none absolute inset-0 ${monthTintClass(monthBucket)}`}
        aria-hidden="true"
      />
      <div className={`night-split absolute ${inset}`}>
        <div className="night-split-inner">
          {nights.slice(0, 2).map((night) => (
            <NightPane key={night.key} night={night} compact={compact} isPast={isPast} />
          ))}
          {!two && addNight && <AddNightPane onClick={addNight} />}
        </div>
      </div>
      {monthLabel && (
        <span
          className={`pointer-events-none absolute z-raised-2 rounded-ui-md bg-surface-950/80 px-0.5 font-bold uppercase tracking-pill text-fg-strong/60 ${
            compact ? "left-0.5 top-0.5 text-6xs" : "left-1 top-1 text-6xs sm:text-5xs"
          }`}
          aria-hidden="true"
        >
          {monthLabel}
        </span>
      )}
      {isToday && <TodayDot className={compact ? "right-1 top-1" : "right-1.5 top-1.5"} />}
    </fieldset>
  );
}

/** One night's pane: its treatment, its headcount, its pill — and its click. */
function NightPane({
  night,
  compact,
  isPast,
}: {
  night: NightCell;
  compact: boolean;
  isPast: boolean;
}) {
  const { picksLocked, attendance, campaign, privateNight, viewerRsvp } = night;
  const showCampaign = !!campaign && picksLocked && !!attendance;
  const showPrivate = !showCampaign && privateNight !== null;
  const invitedPending = showPrivate && !isPast && privateNight?.viewerSeat === "invited";
  const chrome = showCampaign
    ? "campaign-night-cell"
    : showPrivate
      ? `private-night-cell ${invitedPending ? "private-night-cell-invited" : ""}`
      : "border-warn-gold/40";
  const clickable = night.interactive && !isPast;
  return (
    <button
      type="button"
      onClick={night.onClick}
      disabled={!clickable}
      aria-label={paneLabel(night, showCampaign, showPrivate)}
      data-campaign={showCampaign ? campaign?.slug : undefined}
      className={`night-pane relative flex overflow-hidden rounded-card-md border transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${chrome} ${
        clickable ? "hover:brightness-110 active:brightness-95" : "pointer-events-none"
      }`}
    >
      {showCampaign ? (
        <CampaignNightLayer compact={compact} viewerRsvp={viewerRsvp} pane />
      ) : showPrivate && privateNight ? (
        <PrivateNightLayer compact={compact} viewerSeat={privateNight.viewerSeat} pane />
      ) : (
        <LockedLayer compact={compact} viewerRsvp={viewerRsvp} showMedallion={picksLocked} pane />
      )}
      {showCampaign && campaign && attendance ? (
        <span className="relative z-lift flex min-w-0 flex-1 items-center justify-center p-0.5">
          <CampaignRelic
            slug={campaign.slug}
            count={attendance.definite}
            className="night-pane-relic h-full w-full"
          />
        </span>
      ) : showPrivate && privateNight ? (
        <SeatTally compact={compact} night={privateNight} pane />
      ) : attendance ? (
        // A pane always shows its headcount — the grid position already
        // says which date this is, and two day numbers would say nothing.
        <PaneHeadcount a={attendance.definite} b={attendance.definite + attendance.tentative} />
      ) : null}
    </button>
  );
}

/** Lock mode: the date's free slot, one tap from a second night. */
function AddNightPane({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Lock in a second night on this date"
      className="night-pane relative flex flex-col items-center justify-center gap-0.5 overflow-hidden rounded-card-md border border-dashed border-warn-gold/40 text-warn-gold/70 transition-all duration-200 ease-out hover:border-warn-gold/80 hover:bg-warn-gold/10 hover:text-warn-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 active:brightness-95"
    >
      <PlusGlyph />
      <span className="night-pane-label text-6xs font-bold uppercase leading-none tracking-pill sm:text-5xs">
        2nd night
      </span>
    </button>
  );
}

/**
 * A pane's headcount (`a/b`, plus an optional small `+n`), sized by the pane
 * itself: `--count-chars` lets the stylesheet fit "12/14" as well as "3/5".
 */
function PaneHeadcount({ a, b, extra = 0 }: { a: number; b: number; extra?: number }) {
  // The small `+n` rides beside the numerals, so it takes a glyph's width too.
  const chars = `${a}/${b}`.length + (extra > 0 ? 1 : 0);
  return (
    <span className="relative z-lift flex min-w-0 flex-1 items-center justify-center">
      <span
        className="night-pane-count flex items-baseline gap-px font-extrabold leading-none text-warn-pale tabular-nums drop-shadow"
        style={{ "--count-chars": String(chars) } as React.CSSProperties}
      >
        <span>{a}</span>
        <span className="text-warn-pale/60">/</span>
        <span>{b}</span>
        {extra > 0 && (
          <span className="night-pane-extra ml-0.5 self-center font-semibold text-warn-pale/60">
            +{extra}
          </span>
        )}
      </span>
    </span>
  );
}

// What a pane's pill would say, as a colour — shown along the pane's bottom
// edge when the pane is too small for the pill itself.
type EdgeTone = "ok" | "muted" | "gold" | "accent" | "ink" | null;

function rsvpTone(viewerRsvp: RsvpStatus | undefined): EdgeTone {
  return viewerRsvp === "yes" ? "ok" : viewerRsvp === "no" ? "muted" : "gold";
}

function seatTone(viewerSeat: ViewerSeat | null): EdgeTone {
  switch (viewerSeat) {
    case "host":
      return "ink";
    case "seated":
      return "ok";
    case "waitlisted":
      return "gold";
    case "invited":
      return "accent";
    case "declined":
      return "muted";
    default:
      return null;
  }
}

function PaneStatusEdge({ tone }: { tone: EdgeTone }) {
  if (!tone) return null;
  const color =
    tone === "ok"
      ? "bg-ok"
      : tone === "muted"
        ? "bg-fg-muted/60"
        : tone === "gold"
          ? "bg-warn-gold motion-safe:animate-pulse-soft"
          : tone === "accent"
            ? "bg-accent-400 motion-safe:animate-pulse-soft"
            : "bg-private-ink/70";
  return (
    <span
      aria-hidden="true"
      className={`night-pane-edge pointer-events-none absolute inset-x-1 bottom-0.5 z-raised h-0.5 rounded-full ${color}`}
    />
  );
}

function paneLabel(night: NightCell, showCampaign: boolean, showPrivate: boolean): string {
  const slot = nightSlot(night.key) === 2 ? "Second night" : "First night";
  let label = `${slot} — locked in`;
  if (showCampaign && night.campaign) label += ` — ${night.campaign.night} night`;
  if (showPrivate && night.privateNight) {
    const { seats, viewerSeat } = night.privateNight;
    label += ` — private night, ${seats.taken} of ${seats.total} seats`;
    if (viewerSeat && viewerSeat !== "outsider") label += `, you: ${viewerSeat}`;
  } else if (night.attendance) {
    label += `, ${night.attendance.definite} going`;
    if (night.attendance.tentative > 0) label += `, ${night.attendance.tentative} maybe`;
  }
  return label;
}

function TodayDot({ className }: { className: string }) {
  return (
    <span
      className={`pointer-events-none absolute h-1.5 w-1.5 animate-pulse rounded-full bg-neon-cyan shadow-[0_0_10px_2px] shadow-neon-cyan/70 ${className}`}
      aria-hidden="true"
    />
  );
}

function PlusGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3 w-3 sm:h-4 sm:w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
