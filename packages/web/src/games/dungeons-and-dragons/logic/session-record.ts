import type {
  Campaign,
  DndCharacter,
  DndHistoryEntry,
  DndParty,
  DndRecordInput,
} from "@boardgames/core/protocol";
import { parseUtcStamp } from "../../../lib/date-format";

// A D&D session, from the moment the DM opens the party's game screen to the
// moment they press "End session" — then one record in their Match History.
//
// The open session lives in localStorage per party, so a refresh, a phone
// lock or a second tab keeps the same session (and its start time). One left
// open longer than a night is stale: the next visit starts a fresh one.

const KEY_PREFIX = "dnd.open-session.v1:";
export const STALE_SESSION_MS = 18 * 60 * 60 * 1000;

export interface OpenSession {
  /** The Match History record id this session saves under. */
  clientId: string;
  startedAt: string;
}

type SessionStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStore(): SessionStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readSession(store: SessionStore | null, partyId: string): OpenSession | null {
  try {
    const raw = store?.getItem(KEY_PREFIX + partyId);
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (
      typeof value === "object" &&
      value !== null &&
      "clientId" in value &&
      "startedAt" in value &&
      typeof value.clientId === "string" &&
      typeof value.startedAt === "string"
    ) {
      return { clientId: value.clientId, startedAt: value.startedAt };
    }
  } catch {
    // Unreadable: start over.
  }
  return null;
}

/** The party's running session, or a new one (stale ones are replaced). */
export function openSession(
  partyId: string,
  newId: () => string,
  now = new Date(),
  store: SessionStore | null = defaultStore(),
): OpenSession {
  const existing = readSession(store, partyId);
  const age = existing ? now.getTime() - Date.parse(existing.startedAt) : Number.NaN;
  if (existing && age >= 0 && age < STALE_SESSION_MS) return existing;
  const fresh = { clientId: newId(), startedAt: now.toISOString() };
  try {
    store?.setItem(KEY_PREFIX + partyId, JSON.stringify(fresh));
  } catch {
    // Memory only: the session still ends and records this page's lifetime.
  }
  return fresh;
}

/** Forget the party's session once it has ended (the next visit starts anew). */
export function closeSession(partyId: string, store: SessionStore | null = defaultStore()): void {
  try {
    store?.removeItem(KEY_PREFIX + partyId);
  } catch {
    // Nothing to do.
  }
}

/** The session's Match History record. */
export function buildSessionRecord(input: {
  campaign: Campaign;
  party: DndParty;
  characters: readonly DndCharacter[];
  history: readonly DndHistoryEntry[];
  waypointIndex: number;
  session: OpenSession;
  endedAt: Date;
}): DndRecordInput {
  const { campaign, party, characters, history, waypointIndex, session, endedAt } = input;
  const since = Date.parse(session.startedAt);
  const checkpoints = campaign.checkpoints.length;
  const index = checkpoints === 0 ? 0 : Math.min(Math.max(waypointIndex, 0), checkpoints - 1);
  const text = (value: string | null | undefined, max: number) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed.slice(0, max) : null;
  };
  return {
    game: "dungeons-and-dragons",
    campaignId: campaign.id,
    campaignTitle: text(campaign.title, 200),
    campaignKind: campaign.kind,
    partyId: party.id,
    partyName: text(party.name, 60) ?? "Party",
    members: characters
      .flatMap((ch) =>
        ch.status === "ready" && ch.sheet
          ? [
              {
                characterId: ch.id,
                name: text(ch.sheet.name, 80),
                playerName: text(ch.sheet.playerName, 80),
                race: text(ch.sheet.race, 60),
                class: ch.sheet.class.trim().slice(0, 80),
                level: ch.sheet.level,
              },
            ]
          : [],
      )
      .slice(0, 12),
    waypoint: {
      index,
      of: checkpoints,
      title: text(campaign.checkpoints[index]?.title, 200),
    },
    loggedEntries: history.filter((h) => {
      const at = parseUtcStamp(h.createdAt);
      return at !== null && at.getTime() >= since;
    }).length,
    startedAt: session.startedAt,
    endedAt: endedAt.toISOString(),
  };
}
