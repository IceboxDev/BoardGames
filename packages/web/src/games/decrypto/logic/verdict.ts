import type {
  Code,
  DecryptoPlayerView,
  Team,
  TransmissionView,
} from "@boardgames/core/games/decrypto/types";
import { fmtCode, teamName } from "./desk";

// What a revealed transmission meant FOR THE VIEWER, in plain words: did we
// decode it, did they intercept us, did our intercept land. One source for the
// reveal board, the "Last" card, the round-end summary and the history rail,
// so the same event always reads the same way.

export type Tone = "good" | "bad" | "neutral";

export interface VerdictLine {
  tone: Tone;
  /** Short, e.g. "We decoded it". */
  title: string;
  /** The numbers behind it, e.g. "We read 1-2-4 · it was 1-2-3". */
  detail: string;
  /** Says nothing happened (round 1's "no interception yet"): only the reveal board shows it. */
  minor?: boolean;
}

export interface Verdict {
  /** One or two words for the stamp, e.g. "Intercepted". */
  stamp: string;
  tone: Tone;
  /** The decode first, then the interception. */
  lines: VerdictLine[];
}

/** A revealed transmission, from a live view or a round summary. */
export interface RevealedTx {
  round: number;
  team: Team;
  code: Code;
  decodeGuess: Code | null;
  interceptGuess: Code | null;
  intercepted: boolean;
  miscommunicated: boolean;
  skipped?: boolean;
}

/** How many positions of `guess` match `code`. */
export function hits(guess: Code | null, code: Code): number {
  return guess ? guess.filter((d, i) => d === code[i]).length : 0;
}

/** Who gets the token, in our words. The 3-player game has one pool: the interceptor's. */
function tokenTo(view: DecryptoPlayerView, team: Team, kind: "white" | "black", us: Team): string {
  const to: Team = view.variant === "interceptor" ? 1 : team;
  const who = to === us ? "us" : teamName(view, to);
  return view.variant === "interceptor" ? `a token to ${who}` : `a ${kind} token to ${who}`;
}

export function verdictFor(view: DecryptoPlayerView, tx: RevealedTx): Verdict {
  const us = view.team;
  const ours = tx.team === us;
  const rival: Team = tx.team === 0 ? 1 : 0;
  const they = teamName(view, ours ? rival : tx.team);
  const interceptable = tx.round > 1 && !tx.skipped;
  const lines: VerdictLine[] = [];

  if (ours) {
    // Our transmission: did we read it, and did they?
    if (tx.skipped) {
      lines.push({
        tone: "bad",
        title: "No clues were sent",
        detail: `The transmission was lost · ${tokenTo(view, us, "black", us)}`,
      });
    } else if (tx.miscommunicated) {
      lines.push({
        tone: "bad",
        title: "We misread it",
        detail: `We read ${fmtCode(tx.decodeGuess)} · it was ${fmtCode(tx.code)} · ${tokenTo(view, us, "black", us)}`,
      });
    } else {
      lines.push({ tone: "good", title: "We decoded it", detail: `${fmtCode(tx.code)}, exactly` });
    }
    if (interceptable) {
      lines.push(
        tx.intercepted
          ? {
              tone: "bad",
              title: `${they} intercepted us`,
              detail: `They read ${fmtCode(tx.code)} exactly · ${tokenTo(view, rival, "white", us)}`,
            }
          : {
              tone: "good",
              title: `Safe from ${they}`,
              detail: `They guessed ${fmtCode(tx.interceptGuess)} · ${hits(tx.interceptGuess, tx.code)} of 3 right`,
            },
      );
    } else if (!tx.skipped) {
      lines.push({
        tone: "neutral",
        title: "No interception yet",
        detail: "Round 1 has no interceptions",
        minor: true,
      });
    }
    const bad = tx.skipped || tx.miscommunicated;
    return {
      stamp:
        bad && tx.intercepted
          ? "Misread & intercepted"
          : tx.skipped
            ? "Lost"
            : bad
              ? "Misread"
              : tx.intercepted
                ? "Intercepted"
                : interceptable
                  ? "Decoded · safe"
                  : "Decoded",
      tone: bad || tx.intercepted ? "bad" : "good",
      lines,
    };
  }

  // Their transmission: did our intercept land, and did they read their own?
  if (interceptable) {
    lines.push(
      tx.intercepted
        ? {
            tone: "good",
            title: "We intercepted it",
            detail: `We read ${fmtCode(tx.code)} exactly · ${tokenTo(view, us, "white", us)}`,
          }
        : {
            tone: "bad",
            title: "Our intercept missed",
            detail: `We read ${fmtCode(tx.interceptGuess)} · it was ${fmtCode(tx.code)} · ${hits(tx.interceptGuess, tx.code)} of 3 right · no token`,
          },
    );
  }
  if (tx.skipped) {
    lines.push({
      tone: "good",
      title: `${they} sent no clues`,
      detail: "Their transmission was lost",
    });
  } else if (tx.miscommunicated) {
    lines.push({
      tone: "good",
      title: `${they} misread it`,
      detail: `They read ${fmtCode(tx.decodeGuess)} · ${tokenTo(view, tx.team, "black", us)}`,
    });
  } else {
    lines.push({
      tone: "neutral",
      title: `${they} decoded it`,
      detail: `${fmtCode(tx.code)}, exactly`,
    });
  }
  const theyFailed = tx.skipped || tx.miscommunicated;
  return {
    stamp: tx.intercepted
      ? "We intercepted!"
      : theyFailed
        ? "They misread"
        : interceptable
          ? "Intercept missed"
          : "They decoded",
    tone: tx.intercepted || theyFailed ? "good" : interceptable ? "bad" : "neutral",
    lines,
  };
}

/** A live view's transmission as the verdict's input (null until it is revealed). */
export function revealedOf(view: DecryptoPlayerView, tx: TransmissionView): RevealedTx | null {
  const r = tx.resolved;
  if (!r) return null;
  return {
    round: view.round,
    team: tx.team,
    code: r.code,
    decodeGuess: r.decodeGuess,
    interceptGuess: r.interceptGuess,
    intercepted: r.intercepted,
    miscommunicated: r.miscommunicated,
    skipped: tx.skipped,
  };
}
