import type { CompanionState } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import { Panel } from "./common";

/** Chronological record of everything the companion booked, newest first. */
export default function LogPanel({ state }: { state: CompanionState }) {
  const entries = [...state.log].reverse();
  return (
    <Panel title="Event log">
      {entries.length === 0 ? (
        <p className="text-sm text-fg-muted">Nothing yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {entries.map((e) => (
            <li key={e.id} className="flex items-baseline gap-2 text-sm">
              <span className="w-14 shrink-0 text-3xs font-bold uppercase tracking-pill text-fg-muted">
                {e.when}
              </span>
              <span className="min-w-0 flex-1 text-fg-primary">{e.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
