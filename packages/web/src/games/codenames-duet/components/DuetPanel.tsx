import { TOTAL_AGENTS } from "@boardgames/core/games/codenames-duet/manifest";
import type { DuetPlayerView } from "@boardgames/core/games/codenames-duet/types";
import { Badge, MicroLabel, PipMeter } from "../../../components/ui";
import { TONE_TEXT } from "../../../components/ui/tones";
import { cn } from "../../../lib/cn";
import { RailCard, RailStat, SeatRow, SeatStatus, TeamChat } from "../../codenames/table";
import { cityName, missionNumbers } from "../campaign/mission-copy";
import { sideLabel } from "../logic";
import { TimerTokens } from "./TimerTokens";

// The left rail: the mission's progress (agents found of 15), the timer as
// a row of tokens, the pair (pictures, AI tier, who is thinking, who dropped
// out — the same rows as Codenames' teams), and — when the partner is a
// person — the pair's chat.

const GREEN = { bg: "bg-cn-green", ring: "ring-cn-green" };

export function DuetPanel({
  view,
  names,
  images,
  onChat,
}: {
  view: DuetPlayerView;
  names: readonly (string | null)[];
  /** People's profile pictures by seat; null = the role icon. */
  images: readonly (string | null)[];
  onChat: (text: string) => void;
}) {
  const suddenDeath = view.phase === "sudden-death";
  const partner = view.seat === 0 ? 1 : view.seat === 1 ? 0 : null;
  const partnerSeat = partner === null ? null : view.seats[partner];
  // A partner the AI stands in for is still a person: the chat waits for them.
  const chat =
    partnerSeat !== null && (!partnerSeat.ai || partnerSeat.standIn) && view.phase !== "over";
  return (
    <div className="flex min-h-0 flex-col gap-3">
      {view.campaign && (
        <Badge tone="accent" shape="pill" size="md" className="flex w-full justify-between gap-2">
          <span className="truncate">Campaign · {cityName(view.campaign.city)}</span>
          <span className="tabular-nums">{missionNumbers(view.campaign.city)}</span>
        </Badge>
      )}
      <RailCard active={view.phase !== "over"} accentBg="bg-cn-green">
        <RailStat
          label={<MicroLabel>Agents found</MicroLabel>}
          value={view.agentsFound}
          unit={`/ ${TOTAL_AGENTS}`}
        />
        <PipMeter
          className="mt-2"
          total={TOTAL_AGENTS}
          filled={view.agentsFound}
          fillClass="bg-cn-green"
          title={`${view.agentsFound} of ${TOTAL_AGENTS} found`}
        />
        <ul className="mt-2.5 flex flex-col gap-1">
          {view.seats.map((s) => (
            <SeatRow
              key={s.seat}
              name={sideLabel(s.seat, names)}
              image={images[s.seat] ?? null}
              ai={s.ai}
              tier={s.standIn ? null : s.tier}
              you={s.seat === view.seat}
              marker={GREEN}
              away={s.awaySince !== null && !s.standIn}
              status={
                <SeatStatus
                  thinking={view.aiThinking === s.seat}
                  presence={s}
                  idle={`${view.agentsLeft[s.seat]} on key`}
                />
              }
            />
          ))}
        </ul>
      </RailCard>

      <RailCard warn={suddenDeath}>
        <RailStat
          label={<MicroLabel>{suddenDeath ? "Sudden death" : "Turns left"}</MicroLabel>}
          value={view.tokens}
          unit={`/ ${view.tokensTotal}`}
          size="sm"
        />
        <div className="mt-2">
          <TimerTokens
            tokens={view.tokens}
            tokensTotal={view.tokensTotal}
            mistakesLeft={view.mistakesLeft}
            mistakesTotal={view.mistakesTotal}
          />
        </div>
        {view.mistakesTotal !== null && !suddenDeath && (
          <p className="mt-2 text-3xs text-fg-secondary">
            {view.mistakesLeft === 0
              ? "No free mistakes left: a bystander now costs two turns."
              : `${view.mistakesLeft} free ${view.mistakesLeft === 1 ? "mistake" : "mistakes"} left (tan).`}
          </p>
        )}
        {suddenDeath && (
          <p className={cn("mt-2 text-3xs", TONE_TEXT.amber)}>
            No clues now: take turns picking. Any bystander or assassin loses.
          </p>
        )}
      </RailCard>

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
