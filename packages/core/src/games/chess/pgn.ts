/**
 * PGN export: the Seven Tag Roster, the time control, how the game ended, and
 * `[%clk]` comments when the game was timed — the form lichess and chess.com
 * import.
 */

import { START_FEN } from "./engine/fen";
import type { ChessResult, HistoryEntry, Termination, TimeControl } from "./schemas";

export interface PgnInput {
  readonly startFen: string;
  readonly moves: readonly HistoryEntry[];
  readonly result: ChessResult | null;
  readonly timeControl: TimeControl | null;
  readonly white: string;
  readonly black: string;
  readonly date?: Date;
  readonly event?: string;
  readonly site?: string;
}

const TERMINATION_TEXT: Readonly<Record<Termination, string>> = {
  checkmate: "Normal",
  resign: "Normal",
  timeout: "Time forfeit",
  "timeout-vs-insufficient": "Time forfeit",
  stalemate: "Normal",
  insufficient: "Normal",
  threefold: "Normal",
  fivefold: "Normal",
  "fifty-move": "Normal",
  "seventy-five-move": "Normal",
  agreement: "Normal",
  abandon: "Abandoned",
};

export function resultToken(result: ChessResult | null): string {
  if (!result) return "*";
  if (result.winner === "w") return "1-0";
  if (result.winner === "b") return "0-1";
  return "1/2-1/2";
}

function clk(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const tag = (name: string, value: string) => `[${name} "${value.replace(/["\\]/g, "")}"]`;

function pgnDate(d: Date): string {
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function toPgn(input: PgnInput): string {
  const result = resultToken(input.result);
  const tags = [
    tag("Event", input.event ?? "Casual game"),
    tag("Site", input.site ?? "BoardGames"),
    tag("Date", input.date ? pgnDate(input.date) : "????.??.??"),
    tag("Round", "-"),
    tag("White", input.white),
    tag("Black", input.black),
    tag("Result", result),
    tag(
      "TimeControl",
      input.timeControl
        ? `${input.timeControl.initialMs / 1000}+${input.timeControl.incrementMs / 1000}`
        : "-",
    ),
  ];
  if (input.result) tags.push(tag("Termination", TERMINATION_TEXT[input.result.termination]));
  if (input.startFen !== START_FEN) tags.push(tag("SetUp", "1"), tag("FEN", input.startFen));

  // Move numbers follow the start position's side to move and move number.
  const fields = input.startFen.split(" ");
  let number = Number(fields[5] ?? "1") || 1;
  let white = (fields[1] ?? "w") === "w";
  const tokens: string[] = [];
  input.moves.forEach((m, i) => {
    if (white) tokens.push(`${number}.`);
    else if (i === 0) tokens.push(`${number}...`);
    tokens.push(m.san);
    if (m.clockMs !== null) tokens.push(`{[%clk ${clk(m.clockMs)}]}`);
    if (!white) number += 1;
    white = !white;
  });
  tokens.push(result);

  // Wrap the movetext at 80 columns, as the PGN standard asks.
  const lines: string[] = [];
  let line = "";
  for (const t of tokens) {
    if (line && line.length + 1 + t.length > 80) {
      lines.push(line);
      line = t;
    } else {
      line = line ? `${line} ${t}` : t;
    }
  }
  if (line) lines.push(line);
  return `${tags.join("\n")}\n\n${lines.join("\n")}\n`;
}
