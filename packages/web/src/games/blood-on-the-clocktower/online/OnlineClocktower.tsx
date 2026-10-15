import { BOT_STRATEGY } from "@boardgames/core/games/blood-on-the-clocktower/manifest";
import type {
  OnlineAction,
  PlayerAction,
} from "@boardgames/core/games/blood-on-the-clocktower/online/actions";
import { BotcViewSchema } from "@boardgames/core/games/blood-on-the-clocktower/online/view";
import type { SeatRequest } from "@boardgames/core/machines/seats";
import { useMemo } from "react";
import { BoardFallback } from "../../../components/RouteFallback";
import { ErrorAlert } from "../../../components/ui";
import type { GameSource } from "../../../hooks/useGameShell";
import { type SoloStart, useSessionFlow } from "../../../hooks/useSessionFlow";
import { BotsSetup, type BotsSetupChoice } from "./BotsSetup";
import { type BotcOnlineApi, BotcOnlineContext, type StAction, stamp } from "./context";
import { PlayerScreen } from "./player/PlayerScreen";
import { StorytellerScreen } from "./storyteller/StorytellerScreen";

/** Singleplayer: you in your chosen seat, a stand-in bot in every other. */
function toSoloStart(choice: BotsSetupChoice): SoloStart {
  const seats = Array.from(
    { length: choice.players + 1 },
    (_, i): SeatRequest =>
      i === choice.seat ? { kind: "human" } : { kind: "ai", strategy: BOT_STRATEGY },
  );
  return { seats, config: choice.config };
}

/**
 * The online game: one Storyteller (room seat 0) and the players, each on
 * their own screen. The view the server sent decides which screen this is —
 * the Storyteller's carries the Grimoire, a player's only what they may know.
 * In a room every seat is a person; solo (Singleplayer) the rest are bots.
 */
export default function OnlineClocktower({ source = "mp" }: { source?: GameSource }) {
  const flow = useSessionFlow<unknown, OnlineAction, unknown, BotsSetupChoice>(source, {
    toSoloStart,
  });
  const parsed = useMemo(
    () => (flow.view === null ? null : BotcViewSchema.safeParse(flow.view)),
    [flow.view],
  );

  const api = useMemo((): BotcOnlineApi | null => {
    if (!parsed?.success) return null;
    const view = parsed.data;
    return {
      view,
      act: (action: PlayerAction) => flow.sendAction(action),
      st: (action: StAction) => {
        if (view.role === "storyteller") flow.sendAction(stamp(action, view.rev));
      },
      error: flow.error,
      endActions: flow.endActions,
    };
  }, [parsed, flow.sendAction, flow.error, flow.endActions]);

  if (flow.phase === "setup") return <BotsSetup onStart={flow.start} error={flow.error} />;
  if (parsed && !parsed.success) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <ErrorAlert message="This game sent something the page doesn't understand — reload to get the latest version." />
      </div>
    );
  }
  if (!api) return <BoardFallback />;
  return (
    <BotcOnlineContext.Provider value={api}>
      {api.view.role === "storyteller" ? <StorytellerScreen /> : <PlayerScreen />}
    </BotcOnlineContext.Provider>
  );
}
