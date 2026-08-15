import type { DecryptoPlayerView, TransmissionView } from "@boardgames/core/games/decrypto/types";
import { MAX_CLUE_LENGTH } from "@boardgames/core/games/decrypto/types";
import { useId, useState } from "react";
import { Button, ErrorAlert, Input, Surface } from "../../../components/ui";

// The encryptor's private desk: the secret code, which keyword each clue slot
// must evoke, and the three clue inputs. Rendered only for the seat whose
// view carries the code (`tx.code` is redacted for everyone else).

export function EncryptorPanel({
  view,
  tx,
  onSubmit,
  error,
}: {
  view: DecryptoPlayerView;
  tx: TransmissionView;
  onSubmit: (clues: [string, string, string]) => void;
  error: string | null;
}) {
  const uid = useId();
  const [clues, setClues] = useState<[string, string, string]>(["", "", ""]);
  const code = tx.code;
  if (!code || !view.myKeywords) return null;

  const complete = clues.every((c) => c.trim().length > 0);

  return (
    <Surface variant="raised" padding="md" className="mx-auto w-full max-w-xl">
      <div className="mb-3 text-center">
        <p className="text-2xs font-semibold uppercase tracking-label text-fg-muted">
          Your secret code
        </p>
        <p className="text-3xl font-black tracking-widest text-accent-300">{code.join(" ")}</p>
        <p className="mt-1 text-3xs text-fg-muted">
          One clue per digit, in order. Your team decodes; the enemy listens.
        </p>
      </div>

      {error && <ErrorAlert message={error} className="mb-3" />}

      <form
        className="flex flex-col gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (complete) onSubmit(clues.map((c) => c.trim()) as [string, string, string]);
        }}
      >
        {code.map((digit, slot) => (
          // The three rows ARE the code's ordered slots — position is identity.
          // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional
          <div key={slot} className="flex items-center gap-3">
            <label htmlFor={`${uid}-clue-${slot}`} className="w-28 shrink-0 text-right">
              <span className="mr-1.5 text-sm font-black text-accent-300">{digit}</span>
              <span className="text-2xs font-semibold uppercase tracking-tight text-fg-secondary">
                {view.myKeywords?.[digit - 1]}
              </span>
            </label>
            <Input
              id={`${uid}-clue-${slot}`}
              value={clues[slot]}
              onChange={(e) => {
                const next = [...clues] as [string, string, string];
                next[slot] = e.target.value;
                setClues(next);
              }}
              maxLength={MAX_CLUE_LENGTH}
              placeholder={`Clue ${slot + 1}`}
              className="min-w-0 flex-1"
            />
          </div>
        ))}
        <div className="mt-1 flex justify-center">
          <Button type="submit" variant="primary" disabled={!complete}>
            Transmit clues
          </Button>
        </div>
      </form>
    </Surface>
  );
}
