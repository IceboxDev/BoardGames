import type {
  Code,
  DecryptoPlayerView,
  TransmissionView,
} from "@boardgames/core/games/decrypto/types";
import { Badge, Surface } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { teamLabel } from "../logic/labels";

// The post-commit reveal, digit by digit: for every clue — what it actually
// meant (with the keyword, when the viewer is on the encrypting team) and how
// each side read it, right or wrong per position. This is where a
// miscommunication becomes legible: you see exactly WHICH clue was misread
// and what it really pointed at. Everything shown is public post-reveal
// (keywords only for the viewer's own team).

function DigitCell({ digit, correct }: { digit: number | null; correct: boolean | null }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-8 items-center justify-center gap-0.5 rounded-md px-1.5 py-0.5 text-sm font-black tabular-nums",
        correct === null
          ? "bg-surface-800/60 text-fg-muted"
          : correct
            ? "bg-emerald-500/15 text-emerald-300"
            : "bg-rose-500/15 text-rose-300",
      )}
    >
      {digit ?? "—"}
      {correct !== null && <span className="text-3xs">{correct ? "✓" : "✗"}</span>}
    </span>
  );
}

function skipMessage(tx: TransmissionView): string {
  return tx.skipReason === "ai"
    ? "The GPT encryptor couldn't produce legal clues in time — transmission skipped, 1 miscommunication."
    : "The clues never came before the timer ran out — transmission skipped, 1 miscommunication.";
}

export function RevealCard({ view, tx }: { view: DecryptoPlayerView; tx: TransmissionView }) {
  const resolved = tx.resolved;
  if (!resolved) return null;
  const who = teamLabel(view.variant, tx.team);
  const opponent = teamLabel(view.variant, tx.team === 0 ? 1 : 0);
  const isMyTeamTx = tx.team === view.team;
  const myKeywords = isMyTeamTx ? view.myKeywords : null;

  // Tint the card by what the reveal means for the VIEWER's side.
  const tokensAgainstViewer = isMyTeamTx && (resolved.miscommunicated || resolved.intercepted);
  const tokensForViewer = !isMyTeamTx && (resolved.miscommunicated || resolved.intercepted);

  const wrongSlots =
    tx.clues !== null && resolved.miscommunicated && !tx.skipped
      ? ([0, 1, 2] as const).filter((i) => resolved.decodeGuess?.[i] !== resolved.code[i])
      : [];

  const correctness = (guess: Code | null, slot: 0 | 1 | 2): boolean | null =>
    guess === null ? null : guess[slot] === resolved.code[slot];

  return (
    <Surface
      variant="raised"
      padding="md"
      className={cn(
        "mx-auto w-full max-w-xl",
        tokensAgainstViewer && "ring-1 ring-rose-500/40",
        tokensForViewer && "ring-1 ring-emerald-500/40",
      )}
    >
      <p className="mb-3 text-center text-2xs font-semibold uppercase tracking-label text-fg-muted">
        {who}'s code revealed: <span className="text-white">{resolved.code.join("-")}</span>
      </p>

      {tx.skipped || tx.clues === null ? (
        <p className="text-center text-sm text-amber-300">{skipMessage(tx)}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-1">
            <thead>
              <tr className="text-2xs font-semibold uppercase tracking-label text-fg-muted">
                <th className="pb-1 text-left font-semibold">Clue</th>
                <th className="pb-1 text-left font-semibold">Meant</th>
                <th className="pb-1 text-center font-semibold">{who} decoded</th>
                {tx.interceptRequired && (
                  <th className="pb-1 text-center font-semibold">{opponent} guessed</th>
                )}
              </tr>
            </thead>
            <tbody>
              {tx.clues.map((clue, i) => {
                const slot = i as 0 | 1 | 2;
                const meant = resolved.code[slot];
                return (
                  <tr key={`${slot}-${clue}`}>
                    <td
                      className="max-w-40 truncate pr-3 text-sm font-semibold text-white"
                      title={clue}
                    >
                      “{clue}”
                    </td>
                    <td className="pr-3 text-sm">
                      <span className="font-black text-accent-300">{meant}</span>
                      {myKeywords && (
                        <span className="ml-1.5 text-2xs font-semibold uppercase tracking-tight text-fg-secondary">
                          {myKeywords[meant - 1]}
                        </span>
                      )}
                    </td>
                    <td className="pr-3 text-center">
                      <DigitCell
                        digit={resolved.decodeGuess?.[slot] ?? null}
                        correct={correctness(resolved.decodeGuess, slot)}
                      />
                    </td>
                    {tx.interceptRequired && (
                      <td className="text-center">
                        <DigitCell
                          digit={resolved.interceptGuess?.[slot] ?? null}
                          correct={correctness(resolved.interceptGuess, slot)}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {isMyTeamTx && wrongSlots.length > 0 && (
        <p className="mt-2 text-center text-xs font-semibold text-rose-300">
          Your team misread clue {wrongSlots.map((s) => s + 1).join(" & ")} — that's a
          miscommunication token.
        </p>
      )}

      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {resolved.intercepted && <Badge tone="emerald">Interception for {opponent}</Badge>}
        {resolved.miscommunicated && !tx.skipped && (
          <Badge tone="rose">Miscommunication for {who}</Badge>
        )}
        {!resolved.intercepted && !resolved.miscommunicated && (
          <Badge tone="sky">Clean transmission</Badge>
        )}
      </div>
    </Surface>
  );
}
