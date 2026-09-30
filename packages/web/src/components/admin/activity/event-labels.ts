import type {
  ActivityMeta,
  ActivityType,
  SettingsChanges,
  TrainerDeck,
} from "@boardgames/core/protocol";
import { capped, count, type DescribeContext, day, forDay, game, person } from "./describe-context";
import { ctaFallbackDestination, greetingPhrase, greetingShortPhrase } from "./greeting-labels";
import { describePageView } from "./page-labels";
import type { Tone } from "./tones";
import { describeSettingsChanges, TRAINER_NAME } from "./trainer-labels";

// One entry per activity type in core's `ActivityMetaSchemas`. The registry is
// a mapped type over the whole vocabulary, so a type added there without an
// entry here fails the web typecheck — the way "geography-train" used to ship
// as a raw id. Each `describe` gets its row's meta already narrowed by
// `parseActivityMeta` (every field optional: rows outlive schema changes).
//
// Wording: past tense, plain words, the member as the implied subject
// ("Dismissed the group spotlight about Melanie"). Name people and games;
// never print an id, a slug, or an internal page name.

/** What the trail's folding learned about a line from its neighbours. */
export interface LineFold {
  /** The page a greeting's button opened, as a destination phrase. */
  destination?: string;
  /** A spotlight subject recovered from a legacy row next to it. */
  subjectUserId?: string;
}

interface EventLabel<K extends ActivityType> {
  tone: Tone;
  describe: (meta: ActivityMeta<K>, ctx: DescribeContext, fold: LineFold) => string;
}

type EventLabels = { readonly [K in ActivityType]: EventLabel<K> };

function trainDay(deck: TrainerDeck): EventLabel<"quiztopia-train"> {
  return { tone: "study", describe: () => `Started the day's ${TRAINER_NAME[deck]} training` };
}

function trainerSettings(deck: TrainerDeck): EventLabel<"quiztopia-settings"> {
  return {
    tone: "study",
    describe: ({ changes }: { changes?: SettingsChanges }) => {
      const what = changes ? describeSettingsChanges(deck, changes) : "";
      return what
        ? `Changed ${TRAINER_NAME[deck]} trainer settings: ${what}`
        : `Saved ${TRAINER_NAME[deck]} trainer settings`;
    },
  };
}

function trainerReset(deck: TrainerDeck): EventLabel<"quiztopia-reset"> {
  return {
    tone: "study",
    describe: ({ reviews }) =>
      `Reset their ${TRAINER_NAME[deck]} progress${
        reviews === undefined ? "" : ` (${count(reviews, "review")} deleted)`
      }`,
  };
}

function describeThemeUpdate(preset: string | undefined): string {
  // The appearance page owns the preset keys; an unknown key title-cases.
  if (!preset) return "Changed their theme";
  if (preset === "classic") return "Went back to the Classic theme";
  if (preset === "custom") return "Customized their theme";
  return `Switched to the ${preset.charAt(0).toUpperCase()}${preset.slice(1)} theme`;
}

function dayStatuses(map: Readonly<Record<string, string>> | undefined): string | undefined {
  if (!map) return undefined;
  const entries = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return undefined;
  return capped(entries.map(([key, status]) => `${day(key)} (${status})`));
}

export const EVENT_LABELS: EventLabels = {
  // ── Sessions ──
  login: { tone: "nav", describe: () => "Signed in" },
  visit: { tone: "nav", describe: () => "Visited the site" },
  "page-view": {
    tone: "nav",
    describe: ({ page, detail }, ctx) => describePageView(page, detail, ctx),
  },
  "profile-view": {
    tone: "nav",
    describe: ({ targetUserId }, ctx) =>
      `Viewed ${person(ctx, targetUserId, "a member")}'s profile`,
  },

  // ── Nights & RSVPs ──
  rsvp: {
    tone: "rsvp",
    describe: ({ date, status, previous, auto }) => {
      // `previous` is only logged on a change; without it this was the first answer.
      const answer = status ?? "yes";
      const verb = previous
        ? `Changed their RSVP from ${previous} to ${answer}`
        : `RSVP'd ${answer}`;
      return `${verb}${forDay(date)}${auto ? " (automatically)" : ""}`;
    },
  },
  "rsvp-cleared": { tone: "rsvp", describe: ({ date }) => `Cleared their RSVP${forDay(date)}` },
  "rsvp-kick": {
    tone: "rsvp",
    describe: ({ date, targetUserId }, ctx) =>
      `Removed ${person(ctx, targetUserId, "an attendee")} from ${day(date) ?? "a night"}`,
  },
  "night-guest": {
    tone: "rsvp",
    describe: ({ date, targetUserId, on }, ctx) => {
      const guest = person(ctx, targetUserId, "a guest");
      const when = day(date) ?? "a night";
      return on === false
        ? `Removed guest ${guest} from ${when}`
        : `Added guest ${guest} to ${when}`;
    },
  },
  "game-vote": {
    tone: "vote",
    describe: ({ date, slug, reaction, on, stage }, ctx) => {
      const title = game(ctx, slug);
      if (stage === "exit") {
        return on === false
          ? `Withdrew their pick of ${title} for the EXIT night${forDay(date, "on")}`
          : `Picked ${title} for the EXIT night${forDay(date, "on")}`;
      }
      const kind = reaction ?? "hype";
      return on === false
        ? `Took back their ${kind} vote for ${title}${forDay(date, "on")}`
        : `Voted ${kind} for ${title}${forDay(date, "on")}`;
    },
  },
  availability: {
    tone: "availability",
    describe: ({ added, changed, removed, can, maybe }) => {
      const parts: string[] = [];
      const add = dayStatuses(added);
      const change = dayStatuses(changed);
      if (add) parts.push(`added ${add}`);
      if (change) parts.push(`changed ${change}`);
      if (removed && removed.length > 0) {
        parts.push(`removed ${capped(removed.map((d) => day(d) ?? d))}`);
      }
      if (parts.length > 0) return `Availability: ${parts.join("; ")}`;
      // Legacy rows from before diff logging carried opaque totals.
      if (can !== undefined || maybe !== undefined) {
        return `Updated their availability (${can ?? 0} can, ${maybe ?? 0} maybe)`;
      }
      return "Updated their availability";
    },
  },
  "picks-locked": {
    tone: "night",
    describe: ({ date, on }) =>
      on === false ? `Reopened game picks${forDay(date)}` : `Locked game picks${forDay(date)}`,
  },
  "night-locked": {
    tone: "night",
    describe: ({ date, hostName, private: isPrivate, seatCount }) => {
      const kind = isPrivate
        ? `a private night${seatCount ? ` (${count(seatCount, "seat")})` : ""}`
        : "a game night";
      return `Locked in ${kind}${forDay(date, "on")}${hostName ? `, hosted by ${hostName}` : ""}`;
    },
  },
  "night-unlocked": {
    tone: "night",
    describe: ({ date }) => `Unlocked the game night${forDay(date, "on")}`,
  },
  "night-invited": {
    tone: "night",
    describe: ({ date, userIds }, ctx) =>
      `Invited ${capped((userIds ?? []).map((id) => person(ctx, id, "a member"))) || "a member"} to ${
        day(date) ?? "a private night"
      }`,
  },
  "night-uninvited": {
    tone: "night",
    describe: ({ date, userIds }, ctx) =>
      `Uninvited ${capped((userIds ?? []).map((id) => person(ctx, id, "a member"))) || "a member"} from ${
        day(date) ?? "a private night"
      }`,
  },
  "night-seats": {
    tone: "night",
    describe: ({ date, seatCount }) =>
      `Set the seats to ${seatCount ?? "unlimited"}${forDay(date)}`,
  },
  "night-pick-mode": {
    tone: "night",
    describe: ({ date, pickMode }) =>
      `Switched ${day(date) ?? "a private night"} to ${
        pickMode === "host" ? "host picks" : "group voting"
      }`,
  },
  "calendar-feed-subscribe": { tone: "profile", describe: () => "Connected the calendar feed" },
  "calendar-feed-unsubscribe": {
    tone: "profile",
    describe: () => "Disconnected the calendar feed",
  },

  // ── Profile ──
  "profile-update": { tone: "profile", describe: () => "Updated their profile" },
  "theme-update": { tone: "profile", describe: ({ preset }) => describeThemeUpdate(preset) },
  "avatar-save": {
    tone: "profile",
    describe: ({ targetUserId }, ctx) =>
      targetUserId
        ? `Updated ${person(ctx, targetUserId, "a member")}'s avatar`
        : "Updated their avatar",
  },

  // ── Matches & ratings ──
  "match-recorded": {
    tone: "match",
    describe: ({ gameTitle, date }) =>
      gameTitle
        ? `Recorded a result for ${gameTitle}${forDay(date)}`
        : `Recorded a match${forDay(date)}`,
  },
  "match-deleted": {
    tone: "match",
    describe: ({ matchId }) => `Deleted a match${matchId === undefined ? "" : ` (#${matchId})`}`,
  },
  "guest-merged": {
    tone: "match",
    describe: ({ guestName, targetUserId, matchesUpdated }, ctx) =>
      `Merged guest ${guestName ?? "player"} into ${person(ctx, targetUserId, "an account")}${
        matchesUpdated === undefined ? "" : ` (${count(matchesUpdated, "match", "matches")})`
      }`,
  },
  "skill-recomputed": {
    tone: "greeting",
    describe: ({ ranked, candidates }) => {
      const moved =
        candidates === undefined
          ? ""
          : candidates === 0
            ? ", nothing moved"
            : `, ${count(candidates, "move")} to announce`;
      return `Recomputed skill ratings${ranked === undefined ? "" : ` (${ranked} ranked)`}${moved}`;
    },
  },

  // ── Greetings ──
  "greeting-published": {
    tone: "greeting",
    describe: ({ targetUserId }, ctx) => {
      const name = ctx.nameOf(targetUserId);
      return `Published a group spotlight${name ? ` about ${name}` : ""}`;
    },
  },
  "greeting-retracted": { tone: "greeting", describe: () => "Retracted a group spotlight" },
  "greeting-response": {
    tone: "greeting",
    describe: ({ kind, action, date, subjectUserId }, ctx, fold) => {
      if (!kind) return action === "cta" ? "Followed a greeting" : "Dismissed a greeting";
      const about = { subjectUserId: subjectUserId ?? fold.subjectUserId, date };
      if (action !== "cta") return `Dismissed ${greetingPhrase(kind, about, ctx)}`;
      // The page the button opened is folded into this line (trail.ts); name
      // it when it was logged, else say where the button leads.
      const destination = fold.destination ?? ctaFallbackDestination(kind, about, ctx);
      return destination
        ? `Followed ${greetingShortPhrase(kind)} to ${destination}`
        : `Followed ${greetingPhrase(kind, about, ctx)}`;
    },
  },

  // ── Collection ──
  "ownership-announced": {
    tone: "collection",
    describe: ({ slug, freeTextName }, ctx) =>
      `Said they own ${slug ? game(ctx, slug) : freeTextName ? `"${freeTextName}"` : "a game"}`,
  },
  "ownership-resolved": {
    tone: "collection",
    describe: ({ action, slug }, ctx) => {
      if (action === "dismiss") return "Had an ownership claim dismissed";
      if (action === "approve-custom") return "Had an ownership claim approved (a custom game)";
      return `Had their claim to own ${game(ctx, slug)} approved`;
    },
  },
  "ownership-removed": {
    tone: "collection",
    describe: ({ slug, by }, ctx) => {
      const title = game(ctx, slug);
      return by === undefined || by === ctx.subjectId
        ? `Removed ${title} from their collection`
        : `${person(ctx, by, "An admin")} removed ${title} from their collection`;
    },
  },
  "played-through": {
    tone: "collection",
    describe: ({ slug, playedThrough }, ctx) =>
      playedThrough === false
        ? `Marked ${game(ctx, slug, "a legacy game")} as not played through`
        : `Marked ${game(ctx, slug, "a legacy game")} as played through`,
  },

  // ── Purchase votes & arrivals ──
  "purchase-vote": {
    tone: "vote",
    describe: ({ slugs }, ctx) =>
      !slugs || slugs.length === 0
        ? "Withdrew their purchase votes"
        : `Voted for ${slugs.map((s) => game(ctx, s)).join(", ")} in the purchase vote`,
  },
  "purchase-vote-sealed": {
    tone: "vote",
    describe: () => "Cast the vote that sealed the purchase vote",
  },
  "purchase-vote-admin": {
    tone: "vote",
    describe: ({ action, candidates, requiredVoters }) => {
      if (action === "close") return "Closed the purchase vote";
      if (action === "delete") return "Deleted the purchase vote";
      if (action !== "create") return "Managed the purchase vote";
      const detail =
        candidates === undefined
          ? ""
          : ` (${count(candidates.length, "candidate")}${
              requiredVoters === undefined ? "" : `, ${requiredVoters} voters needed`
            })`;
      return `Opened a purchase vote${detail}`;
    },
  },
  "arrival-published": {
    tone: "greeting",
    describe: ({ games }, ctx) =>
      !games || games.length === 0
        ? "Announced an arrival"
        : `Announced the arrival of ${games.map((g) => game(ctx, g.slug)).join(", ")}`,
  },
  "arrival-received": {
    tone: "greeting",
    describe: ({ slug }, ctx) => `Received ${game(ctx, slug)} from the purchase vote`,
  },
  "arrival-retracted": {
    tone: "greeting",
    describe: () => "Retracted an arrival announcement",
  },

  // ── Trainers ──
  "quiztopia-train": trainDay("quiztopia"),
  "quiztopia-settings": trainerSettings("quiztopia"),
  "quiztopia-reset": trainerReset("quiztopia"),
  "geography-train": trainDay("geography"),
  "geography-settings": trainerSettings("geography"),
  "geography-reset": trainerReset("geography"),
};
