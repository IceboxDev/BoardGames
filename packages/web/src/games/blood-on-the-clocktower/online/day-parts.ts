import type { BotcView } from "@boardgames/core/games/blood-on-the-clocktower/online/view";

// The game as a sequence of named parts everyone can point at — "it's the
// discussion", "Ada is defending", "the clock is going round" — so neither
// screen has to work out from raw flags what is happening, and the track,
// the announcement and the centre of the square always agree.

export type DayPartId =
  | "setup"
  | "reveal"
  | "night"
  | "discussion"
  | "nominations"
  | "defence"
  | "voting"
  | "counting"
  | "dusk"
  | "over";

/** The steps on the phase track; the vote's parts sit inside Nominations. */
export type TrackStep = "night" | "discussion" | "nominations" | "dusk";

export const TRACK: readonly { readonly step: TrackStep; readonly label: string }[] = [
  { step: "night", label: "Night" },
  { step: "discussion", label: "Discussion" },
  { step: "nominations", label: "Nominations" },
  { step: "dusk", label: "Dusk" },
];

export function dayPartOf(view: BotcView): DayPartId {
  if (view.stage === "setup") return "setup";
  if (view.stage === "reveal") return "reveal";
  const phase = view.phase.kind;
  if (phase === "ended" || view.stage === "over") return "over";
  if (phase === "night") return "night";
  if (phase !== "day") return "setup";
  const vote = view.day.vote;
  if (vote && !vote.result) {
    if (vote.status === "open") return "defence";
    if (vote.status === "done") return "counting";
    return "voting";
  }
  if (view.day.timer?.kind === "dusk") return "dusk";
  return view.day.nominationsOpen ? "nominations" : "discussion";
}

export function trackStepOf(part: DayPartId): TrackStep | null {
  switch (part) {
    case "night":
      return "night";
    case "discussion":
      return "discussion";
    case "nominations":
    case "defence":
    case "voting":
    case "counting":
      return "nominations";
    case "dusk":
      return "dusk";
    default:
      return null;
  }
}

const nameIn = (view: BotcView, seat: number) => view.names[seat] ?? `Player ${seat}`;

/** The town's (unretracted) timeline after the last phase line `match` accepts. */
function since(view: BotcView, match: (text: string) => boolean) {
  let at = view.timeline.length - 1;
  while (at >= 0) {
    const t = view.timeline[at];
    if (t?.kind === "phase" && match(t.text)) break;
    at -= 1;
  }
  return at === -1 ? [] : view.timeline.slice(at + 1).filter((t) => !t.retracted);
}

/** What the town learned at dawn: "Ada died in the night." or "Nobody died in the night." */
export function morningNews(view: BotcView): string {
  const news = since(view, (t) => / dawns\.$/.test(t))
    .filter((t) => t.kind === "death" || t.kind === "life")
    .map((t) => t.text);
  return news.length > 0 ? news.join(" ") : "Nobody died in the night.";
}

/** Today's execution line, if there was one. */
export function executionNews(view: BotcView): string | null {
  const today = since(view, (t) => / dawns\.$/.test(t));
  const executed = today.filter((t) => t.kind === "execution" || t.kind === "death");
  const line = executed.find((t) => t.kind === "execution");
  if (!line) return null;
  const died = executed.find((t) => t.kind === "death" && t.at >= line.at);
  return died ? `${line.text} ${died.text}` : line.text;
}

export interface Announcement {
  /** Changes exactly when a new announcement is due. */
  readonly key: string;
  readonly icon: string;
  readonly title: string;
  readonly detail: string;
  readonly tone: "night" | "day" | "vote" | "grave" | "end";
}

/** The card that announces the part the game just entered, or `null` for none. */
export function announcementOf(view: BotcView): Announcement | null {
  const part = dayPartOf(view);
  const n = view.phase.kind === "night" || view.phase.kind === "day" ? view.phase.number : 0;
  const vote = view.day.vote;
  switch (part) {
    case "setup":
      return null;
    case "reveal":
      return {
        key: "reveal",
        icon: "🎭",
        title: "Characters are dealt",
        detail: "Look at your character, then tell the Storyteller you've seen it.",
        tone: "day",
      };
    case "night":
      return {
        key: `night:${n}`,
        icon: "🌙",
        title: `Night ${n}`,
        detail: "The town sleeps. The Storyteller wakes players one by one.",
        tone: "night",
      };
    case "discussion":
      return {
        key: `discussion:${n}`,
        icon: "☀️",
        title: `Day ${n}`,
        detail: `${morningNews(view)} Talk it over before nominations open.`,
        tone: "day",
      };
    case "nominations":
      if (vote?.result) {
        return {
          key: `result:${n}:${vote.nominee}`,
          icon: vote.result.outcome.includes("about to die") ? "⚖️" : "🕊️",
          title: `${vote.result.votes} vote${vote.result.votes === 1 ? "" : "s"} on ${nameIn(view, vote.nominee)}`,
          detail: `${vote.result.required} needed: ${vote.result.outcome}. Nominations stay open.`,
          tone: "vote",
        };
      }
      return {
        key: `nominations:${n}`,
        icon: "☝️",
        title: "Nominations are open",
        detail: "Each living player may nominate once a day.",
        tone: "vote",
      };
    case "defence":
      if (!vote) return null;
      return {
        key: `defence:${n}:${vote.nominee}`,
        icon: "☝️",
        title: `${nameIn(view, vote.nominator)} nominates ${nameIn(view, vote.nominee)}`,
        detail: "Accusation and defence — then the vote. You may raise your hand already.",
        tone: "vote",
      };
    case "voting":
      if (!vote) return null;
      return {
        key: `voting:${n}:${vote.nominee}`,
        icon: "✋",
        title: `Vote on ${nameIn(view, vote.nominee)}`,
        detail: "The clock goes round the circle. A hand is final once it passes.",
        tone: "vote",
      };
    case "counting":
      return null;
    case "dusk": {
      const executed = executionNews(view);
      return {
        key: `dusk:${n}`,
        icon: executed ? "🪦" : "🌆",
        title: "Dusk",
        detail: `${executed ?? "Nobody is executed today."} Night falls soon.`,
        tone: executed ? "grave" : "night",
      };
    }
    case "over":
      return view.phase.kind === "ended"
        ? {
            key: "over",
            icon: view.phase.winner === "good" ? "🌅" : "🩸",
            title: view.phase.winner === "good" ? "Good wins" : "Evil wins",
            detail: view.phase.reason,
            tone: "end",
          }
        : null;
  }
}

/** When the vote's clock reaches `seat` (server ms), or `null` when it can't say. */
export function clockReachesAt(view: BotcView, seat: number): number | null {
  const vote = view.day.vote;
  if (!vote) return null;
  const at = vote.order.indexOf(seat);
  if (at === -1 || at < vote.locked) return null;
  const step = view.config.voteClockMs;
  if (vote.status === "running" && vote.nextTickAt !== null) {
    return vote.nextTickAt + (at - vote.locked) * step;
  }
  if (vote.status === "open" && view.day.timer?.kind === "defence") {
    return view.day.timer.endsAt + (at + 1) * step;
  }
  return null;
}

/** "1:05", "0:09". */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** What the Ready button says in this part of the day, or `null` when there's nothing to be ready for. */
export function readyLabelOf(part: DayPartId): string | null {
  switch (part) {
    case "discussion":
      return "Ready for nominations";
    case "nominations":
      return "Ready to end the day";
    case "defence":
      return "Ready to vote";
    default:
      return null;
  }
}
