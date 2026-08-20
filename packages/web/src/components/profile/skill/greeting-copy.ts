// Words for a spotlight. Pure formatters, no React.
//
// House rules, all enforced by the adjacent test because they are easy to
// break by accident:
//
// - Never name the person who was overtaken. Someone reaching 1st means
//   someone else stopped being 1st, and that person's evening is not news.
// - Never "4th of 12". Ordinals carry the story; field sizes read like an exam
//   result and shrink with the group.
// - It's a group, never a club.
// - The subject reads about themselves in second person; everyone else reads
//   about them by first name. Same fact, one voice each.

import type { SpotlightEvent } from "@boardgames/core/protocol";
import { resolveGame } from "../../../lib/games-by-slug.ts";
import { ordinal, traitLabel } from "./trait-copy.ts";

export type SpotlightVoice = { voice: "you" | "them"; firstName: string };

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
function spell(n: number): string {
  return WORDS[n] ?? String(n);
}

/** Sentence-cased spelling — "Five straight" reads better than "five straight". */
function Spell(n: number): string {
  const word = spell(n);
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function gameTitle(slug: string): string {
  return resolveGame(slug)?.title ?? slug;
}

/** "You" / "Riccardo" — the sentence subject. */
function who({ voice, firstName }: SpotlightVoice): string {
  return voice === "you" ? "You" : firstName;
}

/** "Your" / "Riccardo's" — the possessive. */
function whose({ voice, firstName }: SpotlightVoice): string {
  return voice === "you" ? "Your" : `${firstName}'s`;
}

/** "You're" / "Riccardo is" — subject plus copula, which don't agree. */
function is({ voice, firstName }: SpotlightVoice): string {
  return voice === "you" ? "You're" : `${firstName} is`;
}

export type SpotlightCopy = { eyebrow: string; title: string; detail: string };

/**
 * The headline card's three lines. `title` has to survive one line in a narrow
 * modal, so it stays short and the arithmetic goes in `detail`.
 */
export function spotlightCopy(event: SpotlightEvent, v: SpotlightVoice): SpotlightCopy {
  switch (event.kind) {
    case "trait-climb": {
      const label = traitLabel(event.trait);
      const climb = climbDetail(event.from, event.to);
      return event.to === 1
        ? {
            eyebrow: `New ${label} leader`,
            title: `${is(v)} the group's new ${label} leader`,
            detail: climb,
          }
        : {
            eyebrow: `Moving up in ${label}`,
            title: `${who(v)} climbed to ${ordinal(event.to)} in ${label}`,
            detail: climb,
          };
    }
    case "game-climb": {
      const title = gameTitle(event.slug);
      const climb = climbDetail(event.from, event.to);
      // Game titles run long ("Blood on the Clocktower"), and the eyebrow is
      // small tracked caps that wraps badly on a phone — so the title stays in
      // the headline and the eyebrow says only what KIND of news this is.
      return event.to === 1
        ? {
            eyebrow: "New name at the top",
            title: `${is(v)} the one to beat at ${title}`,
            detail: climb,
          }
        : {
            eyebrow: "Moving up",
            title: `${who(v)} climbed to ${ordinal(event.to)} at ${title}`,
            detail: climb,
          };
    }
    case "profile-unlocked":
      return {
        eyebrow: "Profile unlocked",
        title: `${whose(v)} skill profile just unlocked`,
        detail: `${event.ratedMatches} rated games across ${spell(event.distinctGames)} different ones.`,
      };
    case "streak-lead":
      return {
        eyebrow: "Longest run in the group",
        title: `${who(v)} hold${v.voice === "you" ? "" : "s"} the longest run going`,
        detail: "And still counting.",
      };
  }
}

/**
 * "Three places gained." The two ordinals are already the hero's big stat, so
 * this line adds the size of the move rather than restating them — and it
 * never mentions who was passed.
 */
function climbDetail(from: number | null, to: number): string {
  if (from === null) return "A first appearance on this board.";
  const passed = from - to;
  return `${Spell(passed)} ${passed === 1 ? "place" : "places"} gained.`;
}

/** The one-line form used for runner-up mentions and the admin's preview list. */
export function spotlightLine(event: SpotlightEvent, v: SpotlightVoice): string {
  switch (event.kind) {
    case "trait-climb":
      return `${who(v)} reached ${ordinal(event.to)} in ${traitLabel(event.trait)}`;
    case "game-climb":
      return `${who(v)} reached ${ordinal(event.to)} at ${gameTitle(event.slug)}`;
    case "profile-unlocked":
      return `${whose(v)} skill profile unlocked`;
    case "streak-lead":
      return `${who(v)} ${v.voice === "you" ? "are" : "is"} on ${spell(event.length)} straight wins`;
  }
}

/**
 * The hero tile's headline stat — the fact stated as briefly as it can be.
 * Climbs render a rank jump instead (a component, not a string), so they are
 * absent here.
 */
export function spotlightStat(event: SpotlightEvent): { eyebrow: string; stat: string } | null {
  switch (event.kind) {
    case "profile-unlocked":
      return { eyebrow: "Now ranked", stat: "All six traits" };
    case "streak-lead":
      return { eyebrow: "On a run", stat: `${Spell(event.length)} straight` };
    default:
      return null;
  }
}
