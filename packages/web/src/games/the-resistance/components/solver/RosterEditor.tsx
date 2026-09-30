import { MAX_PLAYERS, MIN_PLAYERS } from "@boardgames/core/games/the-resistance/rules";
import { useQuery } from "@tanstack/react-query";
import { Reorder, useDragControls } from "framer-motion";
import { useMemo, useState } from "react";
import { GripVerticalIcon, TrashIcon } from "../../../../components/icons";
import { Button, IconButton, Input } from "../../../../components/ui";
import { RADIUS_CARD_MD } from "../../../../components/ui/radii";
import { fetchAvailableGames } from "../../../../lib/calendar-games";
import { fetchCalendarLocks, nightsForDate } from "../../../../lib/calendar-locks";
import { cn } from "../../../../lib/cn";
import { dateKey } from "../../../../lib/offline-availability";
import { fetchPlayers } from "../../../../lib/profile";
import { qk } from "../../../../lib/query-keys";

// The table, in seating order — the Blood on the Clocktower companion's
// roster: pull tonight's RSVPs in one tap, or type names with club members
// suggested as you go; drag to match the circle (the lead passes clockwise).

interface Entry {
  id: number;
  name: string;
}

let nextId = 1;
const toEntries = (names: readonly string[]): Entry[] =>
  names.map((name) => ({ id: nextId++, name }));

export function RosterEditor({
  names,
  onChange,
}: {
  names: readonly string[];
  onChange: (names: string[]) => void;
}) {
  const [entries, setEntriesState] = useState<Entry[]>(() => toEntries(names));
  const [draft, setDraft] = useState("");
  const setEntries = (next: Entry[]) => {
    setEntriesState(next);
    onChange(next.map((e) => e.name));
  };

  const todayKey = dateKey(new Date());
  const locksQuery = useQuery({
    queryKey: qk.calendarLocks(),
    queryFn: ({ signal }) => fetchCalendarLocks(signal),
  });
  // A private night we're not on arrives redacted — its roster isn't ours.
  const tonightRef = nightsForDate(locksQuery.data, todayKey)[0] ?? null;
  const tonightKey = tonightRef?.key ?? todayKey;
  const nightTonight = Boolean(tonightRef?.lock) && !tonightRef?.lock.redacted;
  const gamesQuery = useQuery({
    queryKey: qk.availableGames(tonightKey),
    queryFn: ({ signal }) => fetchAvailableGames(tonightKey, signal),
    enabled: nightTonight,
  });
  const attendees = gamesQuery.data?.attendees ?? [];
  const going = attendees.filter((a) => a.status === "definite");
  const maybes = attendees.filter((a) => a.status === "tentative");

  const playersQuery = useQuery({
    queryKey: qk.players(),
    queryFn: ({ signal }) => fetchPlayers(signal),
  });
  const suggestions = useMemo(() => {
    const q = draft.trim().toLowerCase();
    if (!q) return [];
    const taken = new Set(entries.map((e) => e.name.toLowerCase()));
    const members = (playersQuery.data?.players ?? []).filter(
      (p) => !taken.has(p.name.toLowerCase()),
    );
    const starts = members.filter((p) => p.name.toLowerCase().startsWith(q));
    const contains = members.filter(
      (p) => !p.name.toLowerCase().startsWith(q) && p.name.toLowerCase().includes(q),
    );
    return [...starts, ...contains].slice(0, 5);
  }, [draft, entries, playersQuery.data]);

  function addName(raw: string) {
    const name = raw.trim().slice(0, 40);
    if (!name || entries.length >= MAX_PLAYERS) return;
    if (entries.some((e) => e.name.toLowerCase() === name.toLowerCase())) return;
    setEntries([...entries, ...toEntries([name])]);
    setDraft("");
  }

  function applyNight(includeMaybes: boolean) {
    const seen = new Set<string>();
    const unique = (includeMaybes ? [...going, ...maybes] : going)
      .map((a) => a.name)
      .filter((n) => {
        const key = n.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    setEntries(toEntries(unique.slice(0, MAX_PLAYERS)));
  }

  const count = entries.length;
  return (
    <div className="flex flex-col gap-2">
      {nightTonight && attendees.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" onClick={() => applyNight(false)}>
            Use tonight's roster ({going.length})
          </Button>
          {maybes.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => applyNight(true)}>
              Include maybes (+{maybes.length})
            </Button>
          )}
        </div>
      )}
      <p className={cn("text-xs", count < MIN_PLAYERS ? "text-amber-300" : "text-fg-muted")}>
        {count} player{count === 1 ? "" : "s"}
        {count < MIN_PLAYERS ? ` — add at least ${MIN_PLAYERS - count} more` : ""} · drag the handle
        to match the seating circle.
      </p>
      <Reorder.Group
        as="div"
        axis="y"
        values={entries}
        onReorder={setEntries}
        className="flex flex-col gap-1.5"
      >
        {entries.map((entry, i) => (
          <RosterRow
            key={entry.id}
            entry={entry}
            index={i}
            onRemove={() => setEntries(entries.filter((e) => e.id !== entry.id))}
          />
        ))}
      </Reorder.Group>
      <div className="flex gap-2">
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
          disabled={!draft.trim() || count >= MAX_PLAYERS}
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
  );
}

function RosterRow({
  entry,
  index,
  onRemove,
}: {
  entry: Entry;
  index: number;
  onRemove: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={entry}
      as="div"
      dragListener={false}
      dragControls={controls}
      whileDrag={{ scale: 1.02 }}
      className={cn(
        RADIUS_CARD_MD,
        "relative flex min-h-10 items-center gap-1 border border-line bg-surface-950/60 pr-1",
      )}
    >
      <div
        aria-hidden="true"
        onPointerDown={(e) => controls.start(e)}
        className="flex min-h-10 w-8 shrink-0 cursor-grab touch-none select-none items-center justify-center text-fg-muted active:cursor-grabbing"
      >
        <GripVerticalIcon className="h-4 w-4" />
      </div>
      <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-fg-muted">
        {index + 1}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-fg-primary">{entry.name}</span>
      <IconButton
        aria-label={`Remove ${entry.name}`}
        icon={<TrashIcon />}
        tone="rose"
        size="sm"
        onClick={onRemove}
      />
    </Reorder.Item>
  );
}
