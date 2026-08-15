import {
  chatAllowed,
  currentTransmission,
  eligibleSeats,
  isGuessCommitted,
  maxRounds,
  pendingClueTransmissions,
  playerCount,
  revealedCluesFor,
  teamOf,
} from "./rules";
import type {
  DecryptoContext,
  DecryptoPlayerView,
  DecryptoViewPhase,
  Digit,
  RevealedClueView,
  RoundSummaryView,
  SeatView,
  Team,
  Transmission,
  TransmissionView,
} from "./types";

// ---------------------------------------------------------------------------
// Per-seat redaction. This projection runs inside the server's snapshot
// observer, so it must be TOTAL: any seat, any phase, never throw. The raw
// snapshot holds both teams' keywords and the live codes — nothing leaves this
// function unless the redaction table says so.
// ---------------------------------------------------------------------------

function transmissionViewFor(
  ctx: DecryptoContext,
  tx: Transmission,
  seat: number,
): TransmissionView {
  const revealed = tx.resolved !== null;
  const isEncryptor = seat === tx.encryptor;
  const decodeEligible = eligibleSeats(ctx, tx, "decode").includes(seat);
  const interceptEligible =
    tx.interceptRequired && eligibleSeats(ctx, tx, "intercept").includes(seat);

  const myDraft = revealed
    ? null
    : decodeEligible && !isGuessCommitted(tx, "decode")
      ? tx.decodeDraft
      : interceptEligible && !isGuessCommitted(tx, "intercept")
        ? tx.interceptDraft
        : null;

  return {
    team: tx.team,
    encryptor: tx.encryptor,
    clues: tx.clues,
    skipped: tx.skipped,
    skipReason: tx.skipReason,
    code: revealed || isEncryptor ? tx.code : null,
    myDraft: myDraft ? ([...myDraft] as TransmissionView["myDraft"]) : null,
    decodeCommitted: tx.decodeGuess !== null,
    interceptCommitted: tx.interceptGuess !== null,
    interceptRequired: tx.interceptRequired,
    resolved: revealed
      ? {
          code: tx.code,
          decodeGuess: tx.decodeGuess,
          interceptGuess: tx.interceptGuess,
          intercepted: tx.resolved?.intercepted ?? false,
          miscommunicated: tx.resolved?.miscommunicated ?? false,
        }
      : null,
  };
}

function roundSummaries(ctx: DecryptoContext): RoundSummaryView[] {
  const summarize = (transmissions: Transmission[]) =>
    transmissions
      .filter((t) => t.resolved !== null)
      .map((t) => ({
        team: t.team,
        encryptor: t.encryptor,
        clues: t.clues,
        skipped: t.skipped,
        skipReason: t.skipReason,
        code: t.code,
        decodeGuess: t.decodeGuess,
        interceptGuess: t.interceptGuess,
        intercepted: t.resolved?.intercepted ?? false,
        miscommunicated: t.resolved?.miscommunicated ?? false,
      }));
  const rows: RoundSummaryView[] = ctx.history.map((record) => ({
    round: record.round,
    transmissions: summarize(record.transmissions),
  }));
  const live = summarize(ctx.current);
  if (live.length > 0) rows.push({ round: ctx.round, transmissions: live });
  return rows;
}

function noteSheetFor(ctx: DecryptoContext): [RevealedClueView[][], RevealedClueView[][]] {
  const byDigit = (team: Team): RevealedClueView[][] => {
    const columns: RevealedClueView[][] = [[], [], [], []];
    for (const entry of revealedCluesFor(ctx, team)) {
      columns[(entry.digit as Digit) - 1]?.push(entry);
    }
    return columns;
  };
  return [byDigit(0), byDigit(1)];
}

export function buildPlayerView(
  ctx: DecryptoContext,
  phase: DecryptoViewPhase,
  seat: number,
): DecryptoPlayerView {
  const team = teamOf(ctx, seat) ?? 0;
  const isMember = teamOf(ctx, seat) !== null;
  const gameOver = phase === "gameOver" && ctx.result !== null;

  const seats: SeatView[] = [];
  for (let i = 0; i < playerCount(ctx.variant); i++) {
    seats.push({
      seat: i,
      team: teamOf(ctx, i) ?? 0,
      isAi: ctx.aiModels[i] != null,
      model: ctx.aiModels[i] ?? null,
      isEncryptor: ctx.current.some((t) => t.encryptor === i && !t.skipped && t.resolved === null),
    });
  }

  const tx = currentTransmission(ctx);
  const myPending = {
    encrypt:
      phase === "clueWriting" && pendingClueTransmissions(ctx).some((t) => t.encryptor === seat),
    decode:
      phase === "guessing" &&
      tx !== null &&
      !tx.skipped &&
      tx.clues !== null &&
      !isGuessCommitted(tx, "decode") &&
      eligibleSeats(ctx, tx, "decode").includes(seat),
    intercept:
      phase === "guessing" &&
      tx !== null &&
      !tx.skipped &&
      tx.clues !== null &&
      tx.interceptRequired &&
      !isGuessCommitted(tx, "intercept") &&
      eligibleSeats(ctx, tx, "intercept").includes(seat),
  };

  // Own-team chat only. A locked-out encryptor sees the log frozen at rounds
  // before this one; the full log reappears once their transmission resolves
  // (views are recomputed from the snapshot on every update).
  const locked = isMember && !chatAllowed(ctx, seat) && ctx.teams[team].players.length >= 2;
  const chat = !isMember
    ? []
    : ctx.chat.filter((m) => m.team === team && (!locked || m.round < ctx.round));

  return {
    variant: ctx.variant,
    phase,
    round: ctx.round,
    maxRounds: maxRounds(ctx.variant),
    seat,
    team,
    myKeywords:
      isMember && !(ctx.variant === "interceptor" && team === 1) ? ctx.teams[team].keywords : null,
    tokens: ctx.teams.map((t) => ({
      interceptions: t.interceptions,
      miscommunications: t.miscommunications,
    })),
    seats,
    transmissions: ctx.current.map((t) => transmissionViewFor(ctx, t, seat)),
    txIdx: ctx.txIdx,
    noteSheet: noteSheetFor(ctx),
    roundSummaries: roundSummaries(ctx),
    chat,
    timerEnabled: ctx.timerEnabled,
    clueTimerDeadlineTs: ctx.clueTimerDeadlineTs,
    myPending,
    result:
      gameOver && ctx.result
        ? {
            ...ctx.result,
            keywords: [
              ctx.teams[0].keywords ? [...ctx.teams[0].keywords] : null,
              ctx.teams[1].keywords ? [...ctx.teams[1].keywords] : null,
            ],
          }
        : null,
  };
}
