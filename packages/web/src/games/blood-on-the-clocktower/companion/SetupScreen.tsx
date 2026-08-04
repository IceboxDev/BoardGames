import type { CompanionState } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import { createGame } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import {
  baseDistribution,
  dealSetup,
  describeDistribution,
  MAX_PLAYERS,
  MIN_PLAYERS,
} from "@boardgames/core/games/blood-on-the-clocktower/setup";
import { useState } from "react";
import { TrashIcon } from "../../../components/icons";
import { Button, IconButton, Input } from "../../../components/ui";
import { Panel, Screen } from "./common";
import { loadRoster, saveRoster } from "./persistence";

/**
 * Roster entry. Names go in SEATING ORDER (clockwise around the circle) —
 * neighbour-based abilities (Chef, Empath) depend on it, so the screen says so
 * loudly. Dealing shuffles characters, never seats.
 */
type RosterEntry = { id: number; name: string };

let nextEntryId = 1;
function toEntries(names: string[]): RosterEntry[] {
  return names.map((name) => ({ id: nextEntryId++, name }));
}

export default function SetupScreen({ onStart }: { onStart: (state: CompanionState) => void }) {
  const [entries, setEntries] = useState<RosterEntry[]>(() => toEntries(loadRoster()));
  const [draft, setDraft] = useState("");
  const names = entries.map((e) => e.name);

  const countOk = names.length >= MIN_PLAYERS && names.length <= MAX_PLAYERS;

  function add() {
    const name = draft.trim();
    if (!name || entries.length >= MAX_PLAYERS) return;
    setEntries([...entries, { id: nextEntryId++, name }]);
    setDraft("");
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
    onStart(createGame(dealSetup(names)));
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
              <span className="min-w-0 flex-1 truncate text-sm text-fg-primary">{entry.name}</span>
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
                if (e.key === "Enter") add();
              }}
              placeholder="Player name"
              aria-label="Player name"
              className="flex-1"
            />
            <Button
              variant="secondary"
              onClick={add}
              disabled={!draft.trim() || names.length >= MAX_PLAYERS}
            >
              Add
            </Button>
          </div>
        </div>
      </Panel>

      {countOk && (
        <Panel title="This game will have" tone="night">
          <p className="text-sm font-semibold text-fg-primary">
            {describeDistribution(baseDistribution(names.length))}
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            Dealt secretly at random. If the Baron is dealt, two Townsfolk become two extra
            Outsiders; if the Drunk is dealt, they'll be shown a Townsfolk they believe they are.
          </p>
        </Panel>
      )}

      <Button variant="primary" size="lg" block disabled={!countOk} onClick={deal}>
        Deal characters
      </Button>
      {!countOk && names.length > 0 && (
        <p className="text-center text-xs text-fg-muted">
          {names.length < MIN_PLAYERS
            ? `Add ${MIN_PLAYERS - names.length} more to start.`
            : "Too many players — Trouble Brewing seats at most 15."}
        </p>
      )}
    </Screen>
  );
}
