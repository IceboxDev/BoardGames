import type { DecryptoPlayerView, TransmissionView } from "@boardgames/core/games/decrypto/types";
import { Badge, Surface } from "../../../components/ui";
import { teamLabel } from "../logic/labels";

// The post-commit reveal: actual code beside both committed guesses, with the
// token outcomes. Everything here is public once the transmission resolves.

function CodeRow({ label, code, good }: { label: string; code: string; good?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-2xs font-semibold uppercase tracking-label text-fg-muted">{label}</span>
      <span
        className={`text-xl font-black tracking-widest ${
          good === undefined ? "text-white" : good ? "text-emerald-300" : "text-rose-300"
        }`}
      >
        {code}
      </span>
    </div>
  );
}

export function RevealCard({ view, tx }: { view: DecryptoPlayerView; tx: TransmissionView }) {
  const resolved = tx.resolved;
  if (!resolved) return null;
  const code = resolved.code.join(" ");
  const who = teamLabel(view.variant, tx.team);
  const opponent = teamLabel(view.variant, tx.team === 0 ? 1 : 0);

  return (
    <Surface variant="raised" padding="md" className="mx-auto w-full max-w-xl">
      <p className="mb-2 text-center text-2xs font-semibold uppercase tracking-label text-fg-muted">
        {who}'s code revealed
      </p>

      {tx.skipped ? (
        <p className="text-center text-sm text-amber-300">
          The clues never came — transmission skipped, 1 miscommunication.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <CodeRow label="Actual code" code={code} />
          <CodeRow
            label={`${who} decoded`}
            code={resolved.decodeGuess?.join(" ") ?? "—"}
            good={!resolved.miscommunicated}
          />
          {tx.interceptRequired && (
            <CodeRow
              label={`${opponent} intercepted`}
              code={resolved.interceptGuess?.join(" ") ?? "—"}
              good={resolved.intercepted}
            />
          )}
        </div>
      )}

      <div className="mt-3 flex justify-center gap-2">
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
