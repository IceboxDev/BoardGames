import type { RevealedClueView, Team } from "@boardgames/core/games/decrypto/types";
import { MAX_NOTE_LENGTH } from "@boardgames/core/games/decrypto/types";
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";

// A team's code screen: four numbered windows (the keywords behind red film,
// or sealed for the enemy's) and, hanging under each window, its teletype
// tape — every clue that has meant that digit, one line per round. Every
// round's line is reserved from the start, so a tape never grows and the
// desk never moves.

interface CodeScreenProps {
  team: Team;
  /** Spoken name of the screen. */
  label: string;
  /** A printed title over the windows (the debrief's "· your keywords"); the live desk has none. */
  title?: string;
  /** The four keywords, or null when they are the enemy's secret. */
  words: readonly string[] | null;
  /** Per digit, the revealed clues that meant it. */
  tapes: readonly (readonly RevealedClueView[])[];
  /** Per window, whether it is lit (a code or draft points at it). */
  lit: readonly boolean[];
  /** Per window, a small tag ("1st") — the encryptor's order. */
  badges?: readonly (string | null)[] | null;
  /** First round whose tape line is still blank. */
  fromRound: number;
  maxRounds: number;
  hidden?: boolean;
  /** The team's pencilled guesses at these (sealed) keywords, editable when `onNote` is set. */
  notes?: readonly string[];
  onNote?: (digit: 1 | 2 | 3 | 4, text: string) => void;
  /** Why the notes can't be written right now (the encryptor's lockout). */
  notesLocked?: string | null;
}

/**
 * A sealed window's pencilled guess: typed locally, sent to the team when the
 * field loses focus or Enter is pressed, and replaced by the team's copy
 * whenever it is not being edited (a teammate may have written it).
 */
function NoteField({
  digit,
  value,
  onNote,
  locked,
}: {
  digit: 1 | 2 | 3 | 4;
  value: string;
  onNote: (digit: 1 | 2 | 3 | 4, text: string) => void;
  locked: string | null;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const text = draft.trim().slice(0, MAX_NOTE);
    if (text !== value) onNote(digit, text);
  };
  return (
    // biome-ignore lint/correctness/noRestrictedElements: a pencil note written on the sealed window, a game piece
    <input
      className="dc-note"
      value={draft}
      maxLength={MAX_NOTE}
      placeholder={locked ? "????" : "guess"}
      disabled={locked !== null}
      title={locked ?? `Your team's guess at their keyword #${digit} — only your team sees it`}
      aria-label={`Your team's guess at their keyword ${digit}`}
      onFocus={() => setEditing(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Escape") {
          if (e.key === "Escape") setDraft(value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

const MAX_NOTE = MAX_NOTE_LENGTH;

const NO_FRESH: ReadonlySet<string> = new Set();

/**
 * The clue's longest word, in characters. The tape's type is monospaced, so
 * CSS can size a line to fit its longest word whole: lines wrap only between
 * words, never mid-word (no "Corporatio-n").
 */
function longestWord(clue: string): number {
  return Math.max(1, ...clue.split(/\s+/).map((w) => [...w].length));
}
const lineKey = (e: RevealedClueView) => `${e.round}-${e.clue}`;

/**
 * Lines added while the player watches (a reveal) type in; the tape as it
 * stands on first render — a reload, the debrief — never prints. Detected
 * before paint so a new line's text never flashes in ahead of its wipe.
 */
function useFreshLines(entries: readonly RevealedClueView[]): ReadonlySet<string> {
  const sig = entries.map(lineKey).join("\n");
  const seen = useRef<ReadonlySet<string> | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(NO_FRESH);
  useLayoutEffect(() => {
    const keys = sig ? sig.split("\n") : [];
    const prev = seen.current;
    seen.current = new Set(keys);
    if (!prev) return;
    const added = keys.filter((k) => !prev.has(k));
    if (added.length === 0) {
      setFresh(NO_FRESH);
      return;
    }
    setFresh(new Set(added));
    const id = setTimeout(() => setFresh(NO_FRESH), 420);
    return () => clearTimeout(id);
  }, [sig]);
  return fresh;
}

function Tape({
  entries,
  fromRound,
  maxRounds,
}: {
  entries: readonly RevealedClueView[];
  fromRound: number;
  maxRounds: number;
}) {
  const fresh = useFreshLines(entries);
  const blanks: number[] = [];
  for (let r = fromRound; r <= maxRounds; r++) blanks.push(r);
  return (
    <div className="dc-tape" style={{ "--dc-rows": maxRounds } as CSSProperties}>
      <div className="dc-tape-paper">
        {entries.map((e) => {
          const key = lineKey(e);
          return (
            <div
              key={key}
              className={`dc-tape-line${fresh.has(key) ? " fresh" : ""}`}
              title={`Round ${e.round}`}
              style={{ "--dc-long": longestWord(e.clue) } as CSSProperties}
            >
              <span className="rd">{e.round}</span>
              <span className="cl">{e.clue}</span>
            </div>
          );
        })}
        {blanks.map((r) => (
          <div key={`blank-${r}`} className="dc-tape-line blank" aria-hidden>
            <span className="rd">{r}</span>
            <span className="cl" />
          </div>
        ))}
      </div>
      <div className="dc-tape-foot" aria-hidden />
    </div>
  );
}

export function CodeScreen({
  team,
  label,
  title,
  words,
  tapes,
  lit,
  badges,
  fromRound,
  maxRounds,
  hidden,
  notes,
  onNote,
  notesLocked = null,
}: CodeScreenProps) {
  return (
    <section
      className={`dc-screen ${team === 0 ? "w" : "b"}${hidden ? " hidden" : ""}`}
      aria-label={label}
    >
      <div className="dc-screen-body">
        {title && <div className="dc-engr dc-screen-title">{title}</div>}
        <div className="dc-screen-row" aria-hidden>
          {[1, 2, 3, 4].map((d) => (
            <span key={d} className="dc-plate">
              {d}
            </span>
          ))}
        </div>
        <div className="dc-screen-row">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`dc-window${words ? "" : " sealed"}${lit[i] ? " lit" : ""}`}>
              {badges?.[i] && <span className="dc-badge">{badges[i]}</span>}
              {words ? (
                <span className="dc-kw" title={words[i]}>
                  {words[i]}
                </span>
              ) : onNote ? (
                <NoteField
                  digit={(i + 1) as 1 | 2 | 3 | 4}
                  value={notes?.[i] ?? ""}
                  onNote={onNote}
                  locked={notesLocked}
                />
              ) : (
                <span className="dc-kw">????</span>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="dc-tapes">
        {[0, 1, 2, 3].map((i) => (
          <Tape key={i} entries={tapes[i] ?? []} fromRound={fromRound} maxRounds={maxRounds} />
        ))}
      </div>
    </section>
  );
}
