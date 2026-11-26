import type { AdminMemberNote, OutstandingItem } from "@boardgames/core/protocol";
import { formatDayKey } from "../../lib/date-format";

// Words for the admin's outstanding overview: how each item reads in the
// drawer (about the member, third person) and how it reads in the reminder
// the admin copies to send them (to the member, second person).

/** "Sat, Nov 29" — or the private night's title before it. */
function nightName(item: { dateKey: string; title: string | null }): string {
  const day = formatDayKey(item.dateKey, "short");
  return item.title ? `${item.title} (${day})` : day;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function missingWords(missing: readonly ("time" | "address")[]): string {
  return missing.map((m) => (m === "time" ? "start time" : "address")).join(" and ");
}

/** The drawer row: a short title and the muted detail line under it. */
export function outstandingLabel(item: OutstandingItem): { title: string; detail?: string } {
  switch (item.kind) {
    case "rsvp":
      return item.reason === "maybe"
        ? { title: `Confirm ${nightName(item)}`, detail: "Only marked maybe" }
        : { title: `RSVP for ${nightName(item)}`, detail: "Never confirmed by hand" };
    case "invite":
      return { title: `Answer the invite · ${nightName(item)}`, detail: "Private night" };
    case "vote":
      return { title: `Vote on games · ${nightName(item)}`, detail: "No picks yet" };
    case "stale-votes":
      return {
        title: `Re-check votes · ${nightName(item)}`,
        detail: `${plural(item.count, "vote")} cast at an old headcount`,
      };
    case "exit-vote":
      return { title: `Pick an EXIT box · ${nightName(item)}` };
    case "purchase-vote":
      return {
        title: `${item.votesLeft} of ${item.votesTotal} purchase votes left`,
        detail: item.title ?? undefined,
      };
    case "host-details":
      return {
        title: `Add the ${missingWords(item.missing)} · ${nightName(item)}`,
        detail: "They host this night",
      };
    case "collection":
      return { title: "Declare their game collection", detail: "Nothing on their shelf yet" };
  }
}

/** One reminder line, written to the member. */
function reminderLine(item: OutstandingItem): string {
  switch (item.kind) {
    case "rsvp":
      return item.reason === "maybe"
        ? `You marked ${nightName(item)} as maybe — can you confirm?`
        : `Confirm whether you're coming on ${nightName(item)}`;
    case "invite":
      return `Answer the invite to ${nightName(item)}`;
    case "vote":
      return `Vote for the games you'd like to play on ${nightName(item)}`;
    case "stale-votes":
      return `Re-check your game votes for ${nightName(item)} — the headcount changed`;
    case "exit-vote":
      return `Pick which EXIT box we play on ${nightName(item)}`;
    case "purchase-vote":
      return `Cast your ${plural(item.votesLeft, "remaining purchase vote")}`;
    case "host-details":
      return `Add the ${missingWords(item.missing)} for the night you host on ${nightName(item)}`;
    case "collection":
      return "Add the games you own to your collection";
  }
}

/**
 * The message the admin pastes into a chat: a greeting, one bullet per thing
 * owed (blank calendar days first, then the items, then the admins' open
 * notes) and the link. Null when there is nothing to remind them of.
 */
export function reminderText(opts: {
  name: string;
  blankDays: number;
  items: readonly OutstandingItem[];
  notes: readonly Pick<AdminMemberNote, "text" | "doneAt">[];
  origin: string;
}): string | null {
  const lines: string[] = [];
  if (opts.blankDays > 0) {
    lines.push(`Mark which days you can make — ${plural(opts.blankDays, "day")} still blank`);
  }
  for (const item of opts.items) lines.push(reminderLine(item));
  for (const note of opts.notes) if (note.doneAt === null) lines.push(note.text);
  if (lines.length === 0) return null;
  const first = opts.name.trim().split(/\s+/)[0] ?? "";
  return [
    `Hey${first ? ` ${first}` : ""}! A few things still open for game night:`,
    ...lines.map((l) => `• ${l}`),
    `${opts.origin}/offline`,
  ].join("\n");
}
