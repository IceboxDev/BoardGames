import type { DecryptoPlayerView } from "@boardgames/core/games/decrypto/types";
import { useState } from "react";
import { Button, Input } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { seatLabel } from "../logic/labels";

// Team chat, shared between the desktop SidePanel and the phone dock.
// Messages arrive pre-redacted (own team only; a locked-out encryptor's view
// omits the current round). Renders nothing when the viewer has no teammates
// (solo interceptor).

export function TeamChat({
  view,
  playerNames,
  onChat,
  listClassName,
}: {
  view: DecryptoPlayerView;
  playerNames: (string | null)[];
  onChat: (text: string) => void;
  /** Height/scroll constraints for the message list. */
  listClassName?: string;
}) {
  const [draft, setDraft] = useState("");
  const me = view.seats.find((s) => s.seat === view.seat);
  const teamSize = view.seats.filter((s) => s.team === view.team).length;
  const chatLocked = me?.isEncryptor === true;
  if (teamSize < 2 || view.phase === "gameOver") return null;

  const submitChat = () => {
    const text = draft.trim();
    if (!text) return;
    onChat(text);
    setDraft("");
  };

  return (
    <div className="flex min-h-0 flex-col gap-1.5">
      <div
        className={cn(
          "min-h-0 overflow-y-auto rounded-lg bg-surface-800/40 p-2",
          listClassName ?? "flex-1",
        )}
      >
        <ul className="flex flex-col gap-1">
          {view.chat.map((m, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only log
              key={i}
              className="text-3xs leading-snug text-fg-secondary"
            >
              <span className="font-semibold text-fg-primary">
                {seatLabel(view, m.seat, playerNames)}:
              </span>{" "}
              {m.text}
            </li>
          ))}
          {view.chat.length === 0 && (
            <li className="text-3xs italic text-fg-disabled">Talk it out with your team…</li>
          )}
        </ul>
      </div>
      {chatLocked ? (
        <p className="text-3xs italic leading-snug text-amber-300/80">
          You're encrypting — no table talk until your code is revealed.
        </p>
      ) : (
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            submitChat();
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message your team"
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
