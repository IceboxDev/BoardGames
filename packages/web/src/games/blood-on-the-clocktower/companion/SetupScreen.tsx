import {
  baseDistribution,
  dealBag,
  describeDistribution,
  MAX_PLAYERS,
  MIN_PLAYERS,
} from "@boardgames/core/games/blood-on-the-clocktower/setup";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { TrashIcon } from "../../../components/icons";
import { Button, IconButton, Input } from "../../../components/ui";
import { fetchAvailableGames } from "../../../lib/calendar-games";
import { fetchCalendarLocks } from "../../../lib/calendar-locks";
import { dateKey } from "../../../lib/offline-availability";
import { fetchPlayers } from "../../../lib/profile";
import { qk } from "../../../lib/query-keys";
import { Panel, Screen } from "./common";
import { type BagDraft, loadRoster, saveRoster } from "./persistence";

/**
 * Roster entry. Names go in SEATING ORDER (clockwise around the circle) —
 * neighbour-based abilities (Chef, Empath) depend on it, so the screen says so
 * loudly. Dealing shuffles characters, never seats.
 */
type RosterEntry = { id: number; name: string; traveller?: boolean };

let nextEntryId = 1;
function toEntries(names: string[]): RosterEntry[] {
  return names.map((name) => ({ id: nextEntryId++, name }));
}

const MAX_TRAVELLERS = 5;

// Fictitious villagers for test mode — clearly not real members (so name
// autocomplete and the match-history port can't silently match them), in
// alphabetical order so seat numbering is easy to eyeball while debugging.
const TEST_NAMES = [
  "Abigail Vale",
  "Barnaby Crank",
  "Cordelia Ash",
  "Dorian Pluck",
  "Esme Thistle",
  "Fergus Moth",
  "Greta Willow",
  "Hugo Marsh",
  "Isolde Fern",
  "Jasper Reed",
  "Lavinia Snow",
  "Mortimer Bligh",
  "Nellie Tuck",
  "Osric Vane",
  "Petunia Crow",
];

export default function SetupScreen({ onDeal }: { onDeal: (draft: BagDraft) => void }) {
  const [entries, setEntries] = useState<RosterEntry[]>(() => toEntries(loadRoster()));
  const [draft, setDraft] = useState("");
  // One attendee runs the game instead of playing — they hold this phone.
  const [storyteller, setStoryteller] = useState<string | undefined>();
  const [testCount, setTestCount] = useState(8);
  const names = entries.map((e) => e.name);

  function fillTestPlayers() {
    setEntries(toEntries(TEST_NAMES.slice(0, testCount)));
    setStoryteller(undefined);
  }

  // Travellers sit in the circle but never draw from the bag — only the
  // RESIDENT count must fit the 5–15 setup sheet.
  const residents = entries.filter((e) => !e.traveller);
  const travellerCount = entries.length - residents.length;
  const countOk = residents.length >= MIN_PLAYERS && residents.length <= MAX_PLAYERS;

  function toggleTraveller(entry: RosterEntry) {
    if (!entry.traveller && travellerCount >= MAX_TRAVELLERS) return;
    setEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...e, traveller: !e.traveller } : e)),
    );
  }

  // Tonight's board game night (if one is locked for today): one tap pulls the
  // RSVP roster in instead of typing everyone by hand.
  const todayKey = dateKey(new Date());
  const locksQuery = useQuery({
    queryKey: qk.calendarLocks(),
    queryFn: ({ signal }) => fetchCalendarLocks(signal),
  });
  const nightTonight = Boolean(locksQuery.data?.[todayKey]);
  const gamesQuery = useQuery({
    queryKey: qk.availableGames(todayKey),
    queryFn: ({ signal }) => fetchAvailableGames(todayKey, signal),
    enabled: nightTonight,
  });
  const attendees = gamesQuery.data?.attendees ?? [];
  const going = attendees.filter((a) => a.status === "definite");
  const maybes = attendees.filter((a) => a.status === "tentative");

  // Registered members feed the name suggestions while typing.
  const playersQuery = useQuery({
    queryKey: qk.players(),
    queryFn: ({ signal }) => fetchPlayers(signal),
  });
  const suggestions = useMemo(() => {
    const q = draft.trim().toLowerCase();
    if (!q) return [];
    const taken = new Set(names.map((n) => n.toLowerCase()));
    const members = (playersQuery.data?.players ?? []).filter(
      (p) => !taken.has(p.name.toLowerCase()),
    );
    const starts = members.filter((p) => p.name.toLowerCase().startsWith(q));
    const contains = members.filter(
      (p) => !p.name.toLowerCase().startsWith(q) && p.name.toLowerCase().includes(q),
    );
    return [...starts, ...contains].slice(0, 5);
  }, [draft, names, playersQuery.data]);

  function addName(raw: string) {
    const name = raw.trim();
    if (!name || entries.length >= MAX_PLAYERS) return;
    if (names.some((n) => n.toLowerCase() === name.toLowerCase())) return;
    setEntries((prev) => [...prev, { id: nextEntryId++, name }]);
    setDraft("");
  }

  function applyNightRoster(includeMaybes: boolean) {
    const roster = includeMaybes ? [...going, ...maybes] : going;
    // Dedupe case-insensitively — names double as React keys downstream.
    const seen = new Set<string>();
    const unique = roster
      .map((a) => a.name)
      .filter((n) => {
        const key = n.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    setEntries(toEntries(unique.slice(0, MAX_PLAYERS + 1)));
    setStoryteller(undefined);
  }

  function makeStoryteller(entry: RosterEntry) {
    setEntries((prev) => {
      const rest = prev.filter((e) => e.id !== entry.id);
      // A previous Storyteller returns to the players.
      return storyteller ? [...rest, { id: nextEntryId++, name: storyteller }] : rest;
    });
    setStoryteller(entry.name);
  }

  function returnStoryteller() {
    if (!storyteller) return;
    setEntries((prev) => [...prev, { id: nextEntryId++, name: storyteller }]);
    setStoryteller(undefined);
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= entries.length) return;
    const next = [...entries];
    [next[index], next[target]] = [next[target], next[index]];
    setEntries(next);
  }

  function deal() {
    if (!countOk) return;
    saveRoster(names);
    onDeal({
      seats: entries.map((e) => ({
        name: e.name,
        ...(e.traveller ? { traveller: { character: null, alignment: "good" as const } } : {}),
      })),
      ...(storyteller ? { storyteller } : {}),
      bag: dealBag(residents.length),
      draws: entries.map(() => null),
    });
  }

  return (
    <Screen>
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold text-white">Storyteller Companion</h1>
        <p className="text-sm text-fg-secondary">
          Trouble Brewing · add {MIN_PLAYERS}–{MAX_PLAYERS} players <b>in seating order</b>,
          clockwise around the circle.
        </p>
      </header>

      {nightTonight && attendees.length > 0 && (
        <Panel tone="gold" title="Board game night tonight">
          <p className="text-sm text-fg-primary">
            {going.length} going{maybes.length > 0 && <> · {maybes.length} maybe</>} — pull the
            guest list straight in, tap <b>DM</b> on whoever runs the game, then reorder to match
            the circle.
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Button variant="primary" block onClick={() => applyNightRoster(false)}>
              Use tonight's roster ({going.length})
            </Button>
            {maybes.length > 0 && (
              <Button variant="secondary" block onClick={() => applyNightRoster(true)}>
                Include maybes (+{maybes.length})
              </Button>
            )}
          </div>
        </Panel>
      )}

      {storyteller && (
        <Panel tone="danger">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm text-fg-primary">
              Storyteller: <b>{storyteller}</b> — runs the game, doesn't play.
            </p>
            <Button variant="ghost" size="xs" onClick={returnStoryteller}>
              Return to players
            </Button>
          </div>
        </Panel>
      )}

      <Panel title={`Players (${names.length})`}>
        <div className="flex flex-col gap-1.5">
          {entries.map((entry, i) => (
            <div
              key={entry.id}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-white/10 bg-surface-950/60 px-2"
            >
              <span className="w-6 shrink-0 text-center text-xs font-bold text-fg-muted">
                {i + 1}
              </span>
              <span
                className={`min-w-0 flex-1 truncate text-sm ${
                  entry.traveller ? "text-purple-300" : "text-fg-primary"
                }`}
              >
                {entry.name}
                {entry.traveller && (
                  <span className="ml-1.5 rounded bg-purple-400/15 px-1 py-0.5 text-3xs font-bold uppercase tracking-pill text-purple-300">
                    Traveller
                  </span>
                )}
              </span>
              <Button
                variant="ghost"
                size="xs"
                aria-label={`Toggle ${entry.name} as a Traveller`}
                title="Traveller: sits in the circle but doesn't draw from the bag"
                className={entry.traveller ? "text-purple-300" : ""}
                disabled={!entry.traveller && travellerCount >= MAX_TRAVELLERS}
                onClick={() => toggleTraveller(entry)}
              >
                Trav
              </Button>
              <Button
                variant="ghost"
                size="xs"
                aria-label={`Make ${entry.name} the Storyteller`}
                title="Make them the Storyteller (they won't play)"
                onClick={() => makeStoryteller(entry)}
              >
                DM
              </Button>
              <Button variant="ghost" size="xs" disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </Button>
              <Button
                variant="ghost"
                size="xs"
                disabled={i === entries.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </Button>
              <IconButton
                icon={<TrashIcon className="h-3.5 w-3.5" />}
                aria-label={`Remove ${entry.name}`}
                onClick={() => setEntries(entries.filter((e) => e.id !== entry.id))}
              />
            </div>
          ))}
          <div className="mt-1 flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addName(draft);
              }}
              placeholder="Player name"
              aria-label="Player name"
              className="flex-1"
              autoComplete="off"
            />
            <Button
              variant="secondary"
              onClick={() => addName(draft)}
              disabled={!draft.trim() || names.length >= MAX_PLAYERS}
            >
              Add
            </Button>
          </div>
          {suggestions.length > 0 && (
            <div className="flex flex-col gap-1">
              {suggestions.map((p) => (
                <Button
                  key={p.id}
                  variant="secondary"
                  size="sm"
                  align="start"
                  block
                  onClick={() => addName(p.name)}
                >
                  {p.name}
                </Button>
              ))}
            </div>
          )}
        </div>
      </Panel>

      {countOk && (
        <Panel title="This game will have" tone="night">
          <p className="text-sm font-semibold text-fg-primary">
            {describeDistribution(baseDistribution(residents.length))}
            {travellerCount > 0 && (
              <span className="text-purple-300">
                {" "}
                · {travellerCount} Traveller{travellerCount === 1 ? "" : "s"}
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            Dealt secretly at random. If the Baron is dealt, two Townsfolk become two extra
            Outsiders; if the Drunk is dealt, they'll be shown a Townsfolk they believe they are.
            {travellerCount > 0 &&
              " Travellers don't draw from the bag — you'll pick their character next."}
          </p>
        </Panel>
      )}

      <Button variant="primary" size="lg" block disabled={!countOk} onClick={deal}>
        Roll the bag
      </Button>
      {!countOk && entries.length > 0 && (
        <p className="text-center text-xs text-fg-muted">
          {residents.length < MIN_PLAYERS
            ? `Add ${MIN_PLAYERS - residents.length} more non-traveller player${
                MIN_PLAYERS - residents.length === 1 ? "" : "s"
              } to start.`
            : "Too many players — Trouble Brewing seats at most 15 (travellers aside)."}
        </p>
      )}

      <Panel title="Test mode">
        <p className="text-xs text-fg-muted">
          Test-run the companion without a real table: replace the roster with fictitious players.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            aria-label="Fewer test players"
            disabled={testCount <= MIN_PLAYERS}
            onClick={() => setTestCount(Math.max(MIN_PLAYERS, testCount - 1))}
          >
            −
          </Button>
          <span className="w-8 text-center text-sm font-bold tabular-nums text-fg-primary">
            {testCount}
          </span>
          <Button
            variant="secondary"
            size="sm"
            aria-label="More test players"
            disabled={testCount >= MAX_PLAYERS}
            onClick={() => setTestCount(Math.min(MAX_PLAYERS, testCount + 1))}
          >
            +
          </Button>
          <Button variant="secondary" size="sm" className="flex-1" onClick={fillTestPlayers}>
            Fill with {testCount} test players
          </Button>
        </div>
      </Panel>
    </Screen>
  );
}
