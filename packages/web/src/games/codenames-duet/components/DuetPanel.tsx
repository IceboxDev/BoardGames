import type { DuetPlayerView } from "@boardgames/core/games/codenames-duet/types";
import { BotIcon, UserIcon } from "../../../components/icons";
import { MicroLabel } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { TeamChat } from "../../codenames/components/TeamChat";
import { tierName } from "../../codenames/logic/review";
import { sideLabel } from "../logic";

// The left rail: the mission's progress (agents found of 15), the timer as
// a row of tokens, each player's side, and — when the partner is a person —
// the pair's chat.

export function DuetPanel({
  view,
  names,
  onChat,
}: {
  view: DuetPlayerView;
  names: readonly (string | null)[];
  onChat: (text: string) => void;
}) {
  const suddenDeath = view.phase === "sudden-death";
  const partner = view.seat === 0 ? 1 : view.seat === 1 ? 0 : null;
  const chat = partner !== null && !view.ai[partner] && view.phase !== "over";
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <section className="rounded-card-lg border border-line-soft bg-fill-soft p-3">
        <div className="flex items-baseline justify-between">
          <MicroLabel>Agents found</MicroLabel>
          <span className="flex items-baseline gap-1">
            <span className="text-3xl font-black tabular-nums leading-none text-fg-strong">
              {view.agentsFound}
            </span>
            <span className="text-xs text-fg-muted">/ 15</span>
          </span>
        </div>
        <div className="mt-2 grid grid-cols-15 gap-0.5" title={`${view.agentsFound} of 15 found`}>
          {Array.from({ length: 15 }, (_, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: pips are positional
              key={i}
              className={cn(
                "h-1.5 rounded-full",
                i < view.agentsFound ? "bg-cn-green" : "bg-fill-strong",
              )}
            />
          ))}
        </div>
      </section>

      <section
        className={cn(
          "rounded-card-lg border p-3",
          suddenDeath ? "border-amber-400/40 bg-amber-500/10" : "border-line-soft bg-fill-soft",
        )}
      >
        <div className="flex items-baseline justify-between">
          <MicroLabel>{suddenDeath ? "Sudden death" : "Turns left"}</MicroLabel>
          <span className="text-sm font-black tabular-nums text-fg-strong">
            {view.tokens}
            <span className="text-xs font-normal text-fg-muted"> / {view.tokensTotal}</span>
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Array.from({ length: view.tokensTotal }, (_, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: tokens are interchangeable
              key={i}
              className={cn(
                "h-4 w-4 rounded-full border-2 transition-colors",
                i < view.tokens
                  ? "border-cn-tan-deep bg-cn-tan shadow"
                  : "border-line bg-transparent",
              )}
            />
          ))}
        </div>
        {suddenDeath && (
          <p className="mt-2 text-3xs text-amber-200">
            No clues now: take turns picking. Any bystander or assassin loses.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-1.5 rounded-card-lg border border-line-soft bg-fill-soft p-3">
        {([0, 1] as const).map((side) => (
          <div key={side} className="flex items-center gap-2 text-xs">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cn-green text-cn-cover-ink">
              {view.ai[side] ? <BotIcon className="h-3 w-3" /> : <UserIcon className="h-3 w-3" />}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                side === view.seat ? "font-bold text-fg-strong" : "text-fg-secondary",
              )}
            >
              {sideLabel(side, names)}
              {side === view.seat && <span className="font-normal text-fg-muted"> (you)</span>}
              {view.tiers[side] && (
                <span className="font-normal text-fg-muted"> · {tierName(view.tiers[side])}</span>
              )}
            </span>
            {view.aiThinking === side ? (
              <span className="flex shrink-0 gap-0.5" title="Thinking…">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1 w-1 animate-bounce rounded-full bg-amber-300"
                    style={{ animationDelay: `${i * 140}ms` }}
                  />
                ))}
              </span>
            ) : (
              <span className="shrink-0 text-3xs tabular-nums text-fg-muted">
                {view.agentsLeft[side]} on key
              </span>
            )}
          </div>
        ))}
      </section>

      {chat && (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <MicroLabel>Chat</MicroLabel>
          <TeamChat
            lines={view.chat.map((m) => ({ from: sideLabel(m.seat, names), text: m.text }))}
            onSend={onChat}
            placeholder="Message your partner"
            lockedReason={view.canChat ? null : "You gave the clue — no hints until the turn ends."}
          />
        </div>
      )}
    </div>
  );
}
