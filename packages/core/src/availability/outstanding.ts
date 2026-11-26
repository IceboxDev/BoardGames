// What a member still owes one locked night: the rules behind the admin's
// outstanding overview. Pure: the server gathers each night's derived state
// (participants from `night-participants.ts`, whether it still votes, whether
// EXIT won it) and passes plain sets, so the rules live in one tested place.
//
//   rsvp         open night, they're on it (marked can / maybe, said yes or
//                were expected) and never answered by hand. The lock-time
//                batch's auto-yes doesn't count — the night card's "Hasn't
//                RSVP'd yet" pill reads the same rule.
//   invite       private night, invited, no answer.
//   vote         the night still votes, their picks count, no hype yet
//                (teach / learn alone isn't a vote — the feed's `[Vote?]`).
//   stale-votes  the night still votes and some of their counted votes were
//                cast at another headcount.
//   exit-vote    EXIT won the night, they're coming, no box picked.
//   host-details they host it and it has no start time or no address.

import type { OutstandingItem } from "../protocol/http/admin-outstanding.ts";

export type NightOutstandingInput = {
  dateKey: string;
  title: string | null;
  isPrivate: boolean;
  hostUserId: string | null;
  eventTime: string | null;
  address: string | null;
  /** The lock-time guest snapshot (`expected_user_ids_json`). */
  expectedUserIds: readonly string[];
  definite: readonly string[];
  tentative: readonly string[];
  /** Private: invited, no answer. */
  invitedNoAnswer: readonly string[];
  /** Whose reactions count toward the lineup. */
  voters: ReadonlySet<string>;
  /** Picks still open: not sealed and no game set in advance. */
  voting: boolean;
  /** Sealed with EXIT as the winner: who has to pick a box. */
  exitAttendees: readonly string[] | null;
  /** Answered by hand: a yes with `auto = 0`, or any no. */
  answeredByHand: ReadonlySet<string>;
  saidNo: ReadonlySet<string>;
  hyped: ReadonlySet<string>;
  /** Counted votes cast at another headcount, per member. */
  staleVotes: ReadonlyMap<string, number>;
  exitVoted: ReadonlySet<string>;
};

export function nightOutstanding(night: NightOutstandingInput): Map<string, OutstandingItem[]> {
  const out = new Map<string, OutstandingItem[]>();
  const add = (userId: string, item: OutstandingItem) => {
    const list = out.get(userId);
    if (list) list.push(item);
    else out.set(userId, [item]);
  };
  const ref = { dateKey: night.dateKey, title: night.title };

  if (night.isPrivate) {
    for (const id of night.invitedNoAnswer) add(id, { kind: "invite", ...ref });
  } else {
    const definite = new Set(night.definite);
    const on = new Set([...night.expectedUserIds, ...night.definite, ...night.tentative]);
    for (const id of on) {
      if (id === night.hostUserId || night.saidNo.has(id) || night.answeredByHand.has(id)) continue;
      const maybeOnly = !definite.has(id) && night.tentative.includes(id);
      add(id, { kind: "rsvp", ...ref, reason: maybeOnly ? "maybe" : "unconfirmed" });
    }
  }

  if (night.voting) {
    for (const id of night.voters) {
      if (!night.hyped.has(id)) add(id, { kind: "vote", ...ref });
    }
    for (const [id, count] of night.staleVotes) {
      if (count > 0 && night.voters.has(id)) add(id, { kind: "stale-votes", ...ref, count });
    }
  }

  for (const id of night.exitAttendees ?? []) {
    if (!night.exitVoted.has(id)) add(id, { kind: "exit-vote", ...ref });
  }

  if (night.hostUserId) {
    const missing: ("time" | "address")[] = [];
    if (!night.eventTime) missing.push("time");
    if (!night.address?.trim()) missing.push("address");
    if (missing.length > 0) add(night.hostUserId, { kind: "host-details", ...ref, missing });
  }

  return out;
}

/** The order the overview lists a member's items in: by night, then by urgency. */
const KIND_ORDER: Record<OutstandingItem["kind"], number> = {
  invite: 0,
  rsvp: 1,
  "host-details": 2,
  "exit-vote": 3,
  vote: 4,
  "stale-votes": 5,
  "purchase-vote": 6,
  collection: 7,
};

export function sortOutstanding(items: readonly OutstandingItem[]): OutstandingItem[] {
  // Nightless items (the purchase poll, the collection) go after every night.
  const night = (i: OutstandingItem) => ("dateKey" in i ? i.dateKey : "\uffff");
  return [...items].sort((a, b) => {
    const na = night(a);
    const nb = night(b);
    if (na !== nb) return na < nb ? -1 : 1;
    return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  });
}
