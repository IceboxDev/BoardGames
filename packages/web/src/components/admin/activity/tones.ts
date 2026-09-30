/**
 * The trail's dot colours: one per family of events, so an admin can scan a
 * day for "what kind of thing happened" before reading the words.
 */
export type Tone =
  | "nav"
  | "rsvp"
  | "vote"
  | "availability"
  | "profile"
  | "night"
  | "match"
  | "greeting"
  | "collection"
  | "study"
  | "unknown";

export const TONE_DOT: Readonly<Record<Tone, string>> = {
  nav: "bg-sky-400/70",
  rsvp: "bg-emerald-400/70",
  vote: "bg-amber-400/70",
  availability: "bg-accent-400/70",
  profile: "bg-fuchsia-400/70",
  night: "bg-rose-400/70",
  match: "bg-teal-400/70",
  greeting: "bg-cyan-400/70",
  collection: "bg-orange-400/70",
  study: "bg-violet-400/70",
  unknown: "bg-fg-strong/40",
};
