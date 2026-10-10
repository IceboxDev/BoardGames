import { useState } from "react";
import { Button, Input } from "../../../components/ui";
import { cn } from "../../../lib/cn";

// Table talk for one side, shared by Codenames (per team) and Duet (the pair).
// Messages arrive pre-filtered by the server; `lockedReason` replaces the
// input for a seat that must keep a straight face (a spymaster).

export interface ChatLine {
  from: string;
  text: string;
}

export function TeamChat({
  lines,
  onSend,
  lockedReason,
  placeholder = "Message your team",
  listClassName,
}: {
  lines: readonly ChatLine[];
  onSend: (text: string) => void;
  lockedReason?: string | null;
  placeholder?: string;
  listClassName?: string;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="flex min-h-0 flex-col gap-1.5">
      <div
        className={cn(
          "min-h-0 overflow-y-auto rounded-card-lg bg-surface-800/40 p-2",
          listClassName ?? "max-h-48",
        )}
      >
        <ul className="flex flex-col gap-1">
          {lines.map((m, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: append-only log
            <li key={i} className="text-3xs leading-snug text-fg-secondary">
              <span className="font-semibold text-fg-primary">{m.from}:</span> {m.text}
            </li>
          ))}
          {lines.length === 0 && (
            <li className="text-3xs italic text-fg-disabled">No messages yet.</li>
          )}
        </ul>
      </div>
      {lockedReason ? (
        <p className="text-3xs italic leading-snug text-amber-300/80">{lockedReason}</p>
      ) : (
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const text = draft.trim();
            if (!text) return;
            onSend(text);
            setDraft("");
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            maxLength={300}
            className="min-w-0 flex-1 px-2 py-1 text-xs"
          />
          <Button type="submit" variant="secondary" size="xs" disabled={!draft.trim()}>
            Send
          </Button>
        </form>
      )}
    </div>
  );
}
