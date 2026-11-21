import type {
  DecryptoPlayerView,
  Digit,
  DraftCode,
  TransmissionView,
} from "@boardgames/core/games/decrypto/types";
import { MAX_CLUE_LENGTH } from "@boardgames/core/games/decrypto/types";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { clueProblem, fmtCode, type LampState, type LastReveal, teamName } from "../../logic/desk";
import { Lamp } from "./Instruments";

// The pieces of the transmission slot: the code card, the "Last" card, the
// incoming teletype strip, the rotary code selectors, the typing sheet and the
// status lamps. The slot's height is fixed; every phase fills the same box.

export function CodeCard({
  code,
  label,
  flip,
}: {
  code: readonly (number | null)[] | null;
  label: string;
  flip?: boolean;
}) {
  return (
    <div className={`dc-card${flip ? " flip" : ""}`}>
      <span className="dc-engr dc-card-label">{label}</span>
      <div className="dc-card-digits" role="img" aria-label={`${label}: ${fmtCode(code)}`}>
        {(code ?? [null, null, null]).map((d, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the card's boxes are its order
          <span key={i}>{d ?? "·"}</span>
        ))}
      </div>
    </div>
  );
}

export function InfoCard({
  eyebrow,
  title,
  text,
  icon,
}: {
  eyebrow: string;
  title: ReactNode;
  text: string;
  /** A painted badge beside the card's text. */
  icon?: string;
}) {
  return (
    <div className="dc-infocard">
      {icon && <img className="dc-infocard-icon" src={icon} alt="" />}
      <span className="dc-engr">{eyebrow}</span>
      <b>{title}</b>
      <span>{text}</span>
    </div>
  );
}

/** The last revealed transmission, so a reveal that has moved on stays readable. */
export function LastCard({ view, last }: { view: DecryptoPlayerView; last: LastReveal | null }) {
  if (!last) {
    return (
      <div className="dc-last">
        <span className="dc-engr">Last</span>
        <span>No code revealed yet</span>
      </div>
    );
  }
  const other = teamName(view, last.team === 0 ? 1 : 0);
  return (
    <div className="dc-last" title="The last revealed transmission">
      <div className="dc-last-top">
        <span className="dc-engr">Last · R{last.round}</span>
        <span className={`dc-tdot t${last.team}`} />
        {teamName(view, last.team)}
      </div>
      <span className="dc-last-code">{fmtCode(last.code)}</span>
      <span className={last.miscommunicated ? "dc-r" : "dc-g"}>
        {last.miscommunicated ? `✗ misread as ${fmtCode(last.decodeGuess)}` : "✓ decoded"}
      </span>
      {last.interceptGuess && (
        <span className={last.intercepted ? "dc-r" : "dc-g"}>
          {last.intercepted
            ? `✗ intercepted by ${other}`
            : `✓ held against ${fmtCode(last.interceptGuess)}`}
        </span>
      )}
    </div>
  );
}

/** The incoming teletype strip: three clues printed across, or a quiet line. */
export function Strip({
  clues,
  printKey,
  placeholder,
}: {
  clues: readonly string[] | null;
  printKey: string;
  placeholder: string;
}) {
  const seen = useRef(printKey);
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (seen.current === printKey || !clues) {
      seen.current = printKey;
      return;
    }
    seen.current = printKey;
    setPrinting(true);
    const id = setTimeout(() => setPrinting(false), 420);
    return () => clearTimeout(id);
  }, [printKey, clues]);

  if (!clues) {
    return (
      <div className="dc-strip idle">
        <span className="dc-strip-wait">{placeholder}</span>
      </div>
    );
  }
  return (
    <div className={`dc-strip${printing ? " print" : ""}`}>
      {clues.map((c, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: clue order IS the code order
        <div key={i} className="dc-strip-cell" title={c} style={{ "--i": i } as CSSProperties}>
          <span className="n">{i + 1}</span>
          <span className="c">{c}</span>
        </div>
      ))}
    </div>
  );
}

// Stud positions around a dial: digits 1–4 across the top arc, the knob's
// pointer turning to the chosen one (and resting pointing down when unset).
const ANGLES = [-67.5, -22.5, 22.5, 67.5];

function Dial({
  slot,
  value,
  active,
  editable,
  onPick,
  onFocusSlot,
}: {
  slot: number;
  value: Digit | null;
  active: boolean;
  editable: boolean;
  onPick: (digit: Digit) => void;
  onFocusSlot: () => void;
}) {
  const angle = value ? (ANGLES[value - 1] ?? 0) : 180;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the studs are the controls; a click on the plate only moves keyboard focus
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard input goes through the board's 1–4 keys
    <div
      className={`dc-dial${active ? " active" : ""}`}
      onClick={editable ? onFocusSlot : undefined}
    >
      <div className="dc-dial-plate" />
      <div className="dc-dial-knob" style={{ transform: `rotate(${angle}deg)` }} />
      {([1, 2, 3, 4] as Digit[]).map((d) => {
        const rad = (((ANGLES[d - 1] ?? 0) - 90) * Math.PI) / 180;
        return (
          // biome-ignore lint/correctness/noRestrictedElements: a dial's brass position stud, a game piece
          <button
            key={d}
            type="button"
            className={`dc-stud${value === d ? " on" : ""}`}
            style={{ left: `${50 + 43 * Math.cos(rad)}%`, top: `${50 + 43 * Math.sin(rad)}%` }}
            disabled={!editable}
            aria-label={`Clue ${slot + 1}: digit ${d}`}
            aria-pressed={value === d}
            onClick={(e) => {
              e.stopPropagation();
              onPick(d);
            }}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Three rotary selectors, one per clue. While guessing they set the team's
 * shared draft; at the reveal they turn to the true code and say how each
 * side read every clue.
 */
export function DialRow({
  view,
  tx,
  draft,
  active,
  editable,
  setActive,
  onPick,
}: {
  view: DecryptoPlayerView;
  tx: TransmissionView;
  draft: DraftCode | null;
  active: number;
  editable: boolean;
  setActive: (slot: number) => void;
  onPick: (slot: 0 | 1 | 2, digit: Digit) => void;
}) {
  const resolved = tx.resolved;
  const mine = tx.team === view.team;
  const caption = (slot: 0 | 1 | 2, value: Digit | null) => {
    if (resolved) {
      const dg = resolved.decodeGuess;
      const ig = resolved.interceptGuess;
      const truth = resolved.code[slot];
      return (
        <div className="dc-cap">
          <span className="rv">
            <Lamp state={dg?.[slot] === truth ? "done" : "bad"} />
            {teamName(view, tx.team)} read {dg?.[slot] ?? "–"}
          </span>
          {tx.interceptRequired && (
            <span className="rv">
              <Lamp state={ig?.[slot] === truth ? "done" : "bad"} />
              {teamName(view, tx.team === 0 ? 1 : 0)} read {ig?.[slot] ?? "–"}
            </span>
          )}
        </div>
      );
    }
    if (value && mine && view.myKeywords) {
      return (
        <div className="dc-cap">
          <span className="kw">→ {view.myKeywords[value - 1]}</span>
        </div>
      );
    }
    if (value) {
      const prior = (view.noteSheet[tx.team]?.[value - 1] ?? []).slice(-2).map((e) => e.clue);
      return (
        <div className="dc-cap">
          <span className="kw">Window {value}</span>
          <span className="prior">{prior.length ? prior.join(" · ") : "no clues yet"}</span>
        </div>
      );
    }
    return (
      <div className="dc-cap dim">
        {editable ? (active === slot ? "Press 1–4" : "Set a digit") : "?"}
      </div>
    );
  };

  return (
    <div className="dc-dials">
      {([0, 1, 2] as const).map((slot) => {
        let value: Digit | null = draft?.[slot] ?? null;
        if (resolved) value = resolved.code[slot];
        else if (!draft && tx.code) value = tx.code[slot];
        return (
          <div key={slot} className="dc-dcol">
            <Dial
              slot={slot}
              value={value}
              active={editable && active === slot}
              editable={editable}
              onFocusSlot={() => setActive(slot)}
              onPick={(d) => onPick(slot, d)}
            />
            {caption(slot, value)}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The encryptor's typing sheet: one line per digit of the code, headed by the
 * keyword it must evoke. The rules are checked as you type; Enter moves down
 * a line and sends from the last. The transmit key in the slot's right column
 * submits this form by its id.
 */
export function TypingSheet({
  formId,
  view,
  tx,
  error,
  onSubmit,
  onFocusLine,
}: {
  formId: string;
  view: DecryptoPlayerView;
  tx: TransmissionView;
  error: string | null;
  onSubmit: (clues: [string, string, string]) => void;
  onFocusLine: (line: number | null) => void;
}) {
  const [lines, setLines] = useState<[string, string, string]>(["", "", ""]);
  const [tried, setTried] = useState(false);
  const [sentError, setSentError] = useState<string | null>(null);
  const r0 = useRef<HTMLInputElement>(null);
  const r1 = useRef<HTMLInputElement>(null);
  const r2 = useRef<HTMLInputElement>(null);
  const refs = [r0, r1, r2];
  const sent = !!tx.clues;
  const problem = clueProblem(view, lines, MAX_CLUE_LENGTH);
  const blank = lines.findIndex((l) => !l.trim());

  useEffect(() => {
    if (!sent) r0.current?.focus({ preventScroll: true });
  }, [sent]);

  // A server refusal shows until the player edits a line.
  useEffect(() => {
    if (error) setSentError(error);
  }, [error]);

  const code = tx.code;
  if (!code || !view.myKeywords) return null;
  const keywords = view.myKeywords;

  let message: string | null = null;
  if (problem) message = problem.text;
  else if (tried && blank >= 0) message = `Blank — line ${blank + 1} needs a clue`;
  else if (sentError) message = sentError;

  return (
    <form
      id={formId}
      className="dc-typer"
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (sent || problem || blank >= 0) return;
        onSubmit(lines.map((l) => l.trim()) as [string, string, string]);
      }}
    >
      {code.map((digit, i) => {
        const ref = refs[i];
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: the lines ARE the code's ordered slots
            key={i}
            className={`dc-ty-line${problem?.line === i ? " bad" : ""}`}
          >
            <span className="dc-ty-head">
              <b>{digit}</b>
              {keywords[digit - 1]}
            </span>
            {sent ? (
              <span className="dc-ty-in">{tx.clues?.[i]}</span>
            ) : (
              // biome-ignore lint/correctness/noRestrictedElements: a typewriter line on the painted sheet, not a form field
              <input
                ref={ref}
                className="dc-ty-in"
                value={lines[i]}
                maxLength={MAX_CLUE_LENGTH + 10}
                placeholder="type a clue"
                aria-label={`Clue ${i + 1}, for window ${digit}`}
                autoComplete="off"
                onFocus={() => onFocusLine(i)}
                onBlur={() => onFocusLine(null)}
                onChange={(e) => {
                  const next = [...lines] as [string, string, string];
                  next[i] = e.target.value;
                  setLines(next);
                  setSentError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (i === 2) {
                    e.currentTarget.form?.requestSubmit();
                    return;
                  }
                  const next = refs[i + 1];
                  if (next && !lines[i + 1]?.trim()) next.current?.focus();
                  else e.currentTarget.form?.requestSubmit();
                }}
              />
            )}
          </div>
        );
      })}
      <div className="dc-ty-foot" aria-live="polite">
        {sent ? (
          <span className="dc-stamp green">Transmitted</span>
        ) : message ? (
          <span className="dc-stamp red" title={message}>
            ✕ {message}
          </span>
        ) : (
          <span className="dc-ty-hint">Enter moves down a line · Enter on the last transmits</span>
        )}
      </div>
    </form>
  );
}

export interface LampRow {
  label: string;
  state: LampState;
  text: string;
}

export function StatusLamps({ rows }: { rows: readonly LampRow[] }) {
  return (
    <div className="dc-lamps" aria-live="polite">
      {rows.map((r) => (
        <div key={r.label} className="dc-lamp-row">
          <Lamp state={r.state} />
          <div>
            <div className="dc-engr">{r.label}</div>
            <div className="dc-lamp-text">{r.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
