import type { DecryptoPlayerView, TransmissionView } from "@boardgames/core/games/decrypto/types";
import { teamName } from "../../logic/desk";
import { revealedOf, type Tone, type Verdict, verdictFor } from "../../logic/verdict";

// The verdict of a revealed transmission, always in the viewer's words: a
// stamp (the outcome that matters most) and one line each for the decode and
// the interception. Green is good for us, red bad for us, grey neither.

const MARK: Record<Tone, string> = { good: "✓", bad: "✗", neutral: "•" };
const STAMP: Record<Tone, string> = { good: "green", bad: "red", neutral: "grey" };

export function VerdictStamp({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`dc-stamp dc-verdict-stamp ${STAMP[verdict.tone]}`}>{verdict.stamp}</span>
  );
}

export function VerdictLines({
  verdict,
  details = true,
  compact = false,
}: {
  verdict: Verdict;
  details?: boolean;
  /** Drop the lines that only say nothing happened. */
  compact?: boolean;
}) {
  return (
    <ul className="dc-vlines">
      {verdict.lines
        .filter((line) => !compact || !line.minor)
        .map((line) => (
          <li key={line.title} className={`dc-vline ${line.tone}`} title={line.detail}>
            <span className="mark" aria-hidden>
              {MARK[line.tone]}
            </span>
            <span className="body">
              <b>{line.title}</b>
              {details && <span className="detail">{line.detail}</span>}
            </span>
          </li>
        ))}
    </ul>
  );
}

/**
 * The reveal, where the dials were: the stamp, the two lines, and the clues
 * one by one — what each meant and what each side read.
 */
export function VerdictBoard({ view, tx }: { view: DecryptoPlayerView; tx: TransmissionView }) {
  const revealed = revealedOf(view, tx);
  if (!revealed) return null;
  const verdict = verdictFor(view, revealed);
  const ours = tx.team === view.team;
  const rival = teamName(view, ours ? (tx.team === 0 ? 1 : 0) : tx.team);
  const ourRead = ours ? revealed.decodeGuess : revealed.interceptGuess;
  const theirRead = ours ? revealed.interceptGuess : revealed.decodeGuess;
  const showOurs = ours || revealed.interceptGuess !== null;
  const showTheirs = !ours || revealed.interceptGuess !== null;
  const read = (guess: typeof ourRead, i: number) => {
    if (!guess) return <span className="dc-vread none">—</span>;
    const ok = guess[i] === revealed.code[i];
    return (
      <span className={`dc-vread ${ok ? "good" : "bad"}`}>
        {guess[i]} {ok ? "✓" : "✗"}
      </span>
    );
  };
  return (
    <div className={`dc-verdict ${verdict.tone}`} aria-live="polite">
      <div className="dc-verdict-head">
        <VerdictStamp verdict={verdict} />
        <VerdictLines verdict={verdict} />
      </div>
      {tx.clues && (
        <table className="dc-vtable">
          <thead>
            <tr>
              <th>Clue</th>
              <th>Meant</th>
              {showOurs && <th>We read</th>}
              {showTheirs && <th>{rival} read</th>}
            </tr>
          </thead>
          <tbody>
            {tx.clues.map((clue, i) => {
              const digit = revealed.code[i] ?? 1;
              const keyword = ours ? view.myKeywords?.[digit - 1] : null;
              return (
                <tr key={clue}>
                  <td className="clue">{clue}</td>
                  <td className="meant">
                    #{digit}
                    {keyword && <span> {keyword}</span>}
                  </td>
                  {showOurs && <td>{read(ourRead, i)}</td>}
                  {showTheirs && <td>{read(theirRead, i)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
