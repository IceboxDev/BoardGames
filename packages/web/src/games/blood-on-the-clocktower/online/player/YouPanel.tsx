import {
  CHARACTERS,
  type CharacterType,
  sheetOrderOf,
} from "@boardgames/core/games/blood-on-the-clocktower/characters";
import { useEffect, useState } from "react";
import { Eyebrow, Textarea } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { TYPE_LABEL } from "../../companion/labels";
import { CharacterIcon, CharacterTag } from "../../companion/ui";
import { InfoCard } from "../components/InfoCard";
import { usePlayer } from "../context";

const TYPES: CharacterType[] = ["townsfolk", "outsider", "minion", "demon", "traveller"];

/** Notes are this device's only — never sent. Keyed by the table, so a new game starts blank. */
function useNotes(key: string): [string, (v: string) => void] {
  const storageKey = `botc-online-notes:${key}`;
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(storageKey) ?? "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    try {
      if (value) localStorage.setItem(storageKey, value);
      else localStorage.removeItem(storageKey);
    } catch {
      // Private mode or blocked storage: notes just don't survive a reload.
    }
  }, [storageKey, value]);
  return [value, setValue];
}

/** The left rail on a player's screen: who you are, what you've learned, your notes, the script. */
export function YouPanel() {
  const { view } = usePlayer();
  const shown = view.me.shown;
  const learned = view.me.inbox.filter((d) => d.payload.kind !== "you-are" || d.when !== "Setup");
  const tableKey = `${view.names.join("|")}:${view.timeline[0]?.at ?? 0}`;
  const [notes, setNotes] = useNotes(tableKey);

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col items-center gap-2 text-center">
        {shown ? (
          <>
            <CharacterIcon character={shown.character} size="xl" />
            <span className="text-lg">
              <CharacterTag character={shown.character} />
              {shown.alignment && (
                <span
                  className={cn(
                    "ml-2 text-sm",
                    shown.alignment === "evil" ? "text-rose-300" : "text-sky-300",
                  )}
                >
                  ({shown.alignment})
                </span>
              )}
            </span>
            <p className="text-sm text-fg-secondary">{CHARACTERS[shown.character].ability}</p>
          </>
        ) : (
          <p className="text-sm text-fg-muted">The Storyteller is preparing the town.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <Eyebrow>What you've learned</Eyebrow>
        {learned.length === 0 ? (
          <p className="text-sm text-fg-muted">Nothing yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...learned].reverse().map((d) => (
              <li key={d.id} className="rounded-card-md bg-fill-soft p-2">
                <span className="text-xs text-fg-muted">{d.when}</span>
                <InfoCard payload={d.payload} names={view.names} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <Eyebrow>Your notes</Eyebrow>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          placeholder="Only on this device — who claimed what, who you trust…"
        />
      </section>

      <details className="flex flex-col gap-2">
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-eyebrow text-fg-muted">
          The script
        </summary>
        <div className="mt-2 flex flex-col gap-3">
          {TYPES.map((type) => {
            const chars = sheetOrderOf(view.edition).filter((c) => CHARACTERS[c].type === type);
            if (chars.length === 0) return null;
            return (
              <div key={type} className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-fg-secondary">{TYPE_LABEL[type]}</span>
                {chars.map((c) => (
                  <div key={c} className="flex items-start gap-2">
                    <CharacterIcon character={c} size="sm" decorative />
                    <p className="text-xs text-fg-secondary">
                      <CharacterTag character={c} /> — {CHARACTERS[c].ability}
                    </p>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}
