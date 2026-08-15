import type { DecryptoPlayerView, Team } from "@boardgames/core/games/decrypto/types";
import { useState } from "react";
import { Badge, Button, Input } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { seatLabel, teamShortLabel } from "../logic/labels";

// Left sidebar: round tracker, token tallies, seat roster, and the team chat.
// Chat content arrives pre-redacted (own team only; a locked-out encryptor's
// view omits the current round's messages).

function TokenPips({ count, tone }: { count: number; tone: "emerald" | "rose" }) {
  return (
    <span className="flex gap-1">
      {[0, 1].map((i) => (
        <span
          key={i}
          className={cn(
            "inline-block h-2.5 w-2.5 rounded-full",
            i < count ? (tone === "emerald" ? "bg-emerald-400" : "bg-rose-400") : "bg-surface-700",
          )}
        />
      ))}
    </span>
  );
}

function TeamRow({
  view,
  team,
  playerNames,
}: {
  view: DecryptoPlayerView;
  team: Team;
  playerNames: (string | null)[];
}) {
  const tokens = view.tokens[team];
  if (!tokens) return null;
  const isMine = team === view.team;
  const interceptorRow = view.variant === "interceptor" && team === 1;
  return (
    <div className={cn("rounded-lg p-2", isMine ? "bg-surface-800/70" : "bg-surface-800/30")}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-2xs font-bold uppercase tracking-label text-fg-primary">
          {teamShortLabel(view.variant, team)}
          {isMine && <span className="text-accent-300"> · you</span>}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-3xs text-fg-secondary">
        <span className="flex items-center gap-1.5">
          Intercepts <TokenPips count={tokens.interceptions} tone="emerald" />
        </span>
        {!interceptorRow && (
          <span className="flex items-center gap-1.5">
            Miscomms <TokenPips count={tokens.miscommunications} tone="rose" />
          </span>
        )}
      </div>
      {tokens.interceptions === 1 && (
        <p className="mt-1 text-3xs font-semibold text-emerald-300/90">
          1 {interceptorRow ? "token" : "interception"} from victory
        </p>
      )}
      {!interceptorRow && tokens.miscommunications === 1 && (
        <p className="mt-1 text-3xs font-semibold text-rose-300/90">
          1 miscommunication from defeat
        </p>
      )}
      <ul className="mt-1.5 flex flex-col gap-0.5">
        {view.seats
          .filter((s) => s.team === team)
          .map((s) => (
            <li key={s.seat} className="flex items-center gap-1.5 text-3xs text-fg-secondary">
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  s.isAi ? "bg-sky-400" : "bg-emerald-400",
                )}
              />
              <span className="truncate">{seatLabel(view, s.seat, playerNames)}</span>
              {s.isEncryptor && (
                <Badge tone="amber" size="xs">
                  Encrypting
                </Badge>
              )}
            </li>
          ))}
      </ul>
    </div>
  );
}

export function SidePanel({
  view,
  playerNames,
  onChat,
}: {
  view: DecryptoPlayerView;
  playerNames: (string | null)[];
  onChat: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const me = view.seats.find((s) => s.seat === view.seat);
  const teamSize = view.seats.filter((s) => s.team === view.team).length;
  const chatLocked = me?.isEncryptor === true;
  const canChat = teamSize >= 2 && view.phase !== "gameOver";

  const submitChat = () => {
    const text = draft.trim();
    if (!text) return;
    onChat(text);
    setDraft("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-2xs font-semibold uppercase tracking-label text-fg-muted">Round</span>
        <span className="text-sm font-bold text-white">
          {Math.max(view.round, 1)} / {view.maxRounds}
        </span>
      </div>

      <TeamRow view={view} team={0} playerNames={playerNames} />
      <TeamRow view={view} team={1} playerNames={playerNames} />

      {view.myKeywords && (
        <div className="rounded-lg bg-surface-800/50 p-2">
          <p className="mb-1 text-2xs font-semibold uppercase tracking-label text-fg-muted">
            Your keywords
          </p>
          <ol className="flex flex-col gap-0.5">
            {view.myKeywords.map((word, i) => (
              <li key={word} className="flex items-baseline gap-1.5">
                <span className="text-2xs font-black text-accent-300">{i + 1}</span>
                <span className="text-xs font-semibold uppercase tracking-tight text-white">
                  {word}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {canChat && (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <p className="text-2xs font-semibold uppercase tracking-label text-fg-muted">Team chat</p>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-surface-800/40 p-2">
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
      )}
    </div>
  );
}
