import type { RoomSlot, RoomState } from "@boardgames/core/protocol";
import type { GameRoomConfig } from "@boardgames/core/protocol/room-config";
import { SetupLayout } from "../setup";

interface LobbyProps {
  roomCode: string;
  roomState: RoomState;
  mySlot: number;
  isHost: boolean;
  roomConfig: GameRoomConfig;
  onStart: () => void;
  onLeave: () => void;
  onKick: (slotIndex: number) => void;
  onToggleReady: () => void;
  onConfigureSlot?: (slotIndex: number, slot: RoomSlot) => void;
  error?: string | null;
  children?: React.ReactNode;
}

export function Lobby({
  roomCode,
  roomState,
  mySlot,
  isHost,
  roomConfig,
  onStart,
  onLeave,
  onKick,
  onToggleReady,
  onConfigureSlot,
  error,
  children,
}: LobbyProps) {
  const allHumansReady = roomState.slots.every((s) => s.kind !== "human" || s.ready);
  const humanCount = roomState.slots.filter((s) => s.kind === "human" && s.connected).length;
  const canStart = isHost && allHumansReady && humanCount >= roomConfig.minPlayers;

  return (
    <SetupLayout>
      {/* Room code */}
      <div className="mb-8 text-center">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
          Room Code
        </div>
        <div className="inline-block rounded-xl border border-gray-700/60 bg-gray-800/60 px-8 py-4">
          <span className="text-4xl font-bold tracking-[0.4em] text-emerald-400 sm:text-5xl">
            {roomCode}
          </span>
        </div>
        <p className="mt-2 text-xs text-gray-500">Share this code with friends on your network</p>
      </div>

      {error && (
        <div className="mx-auto mb-4 w-full max-w-md rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-center text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Player slots */}
      <div className="mx-auto mb-6 w-full max-w-md space-y-2">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
          Players
        </div>
        {roomState.slots.map((slot, i) => (
          <SlotRow
            // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional, no stable ID
            key={`slot-${i}-${slot.kind}-${slot.playerName ?? ""}`}
            slot={slot}
            index={i}
            isMe={i === mySlot}
            canKick={isHost && i !== 0 && slot.kind === "human"}
            canToggle={isHost && i !== 0 && roomConfig.supportsAI}
            onKick={() => onKick(i)}
            onToggle={() => {
              if (!onConfigureSlot) return;
              if (slot.kind === "open") {
                onConfigureSlot(i, {
                  kind: "ai",
                  aiStrategy: "heuristic-v1",
                  ready: false,
                  connected: false,
                });
              } else if (slot.kind === "ai") {
                onConfigureSlot(i, { kind: "open", ready: false, connected: false });
              }
            }}
          />
        ))}
      </div>

      {/* Game-specific config */}
      {children}

      {/* Actions */}
      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        {isHost ? (
          <button
            type="button"
            disabled={!canStart}
            onClick={onStart}
            className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600"
          >
            Start Game
            {!canStart && humanCount < roomConfig.minPlayers
              ? ` (need ${roomConfig.minPlayers} players)`
              : ""}
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggleReady}
            className={`rounded-lg px-6 py-3 text-sm font-semibold text-white transition-colors ${
              roomState.slots[mySlot]?.ready
                ? "bg-amber-600 hover:bg-amber-500"
                : "bg-emerald-600 hover:bg-emerald-500"
            }`}
          >
            {roomState.slots[mySlot]?.ready ? "Not Ready" : "Ready"}
          </button>
        )}

        <button
          type="button"
          onClick={onLeave}
          className="text-xs text-gray-500 transition-colors hover:text-gray-300"
        >
          Leave Room
        </button>
      </div>
    </SetupLayout>
  );
}

// ---------------------------------------------------------------------------
// Slot row
// ---------------------------------------------------------------------------

function SlotRow({
  slot,
  index,
  isMe,
  canKick,
  canToggle,
  onKick,
  onToggle,
}: {
  slot: RoomSlot;
  index: number;
  isMe: boolean;
  canKick: boolean;
  canToggle: boolean;
  onKick: () => void;
  onToggle: () => void;
}) {
  const isSlotHost = index === 0;

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
        isMe ? "border-emerald-500/30 bg-emerald-500/5" : "border-gray-700/60 bg-gray-800/30"
      }`}
    >
      {/* Status indicator */}
      <div
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          slot.kind === "human" && slot.connected
            ? slot.ready
              ? "bg-emerald-400"
              : "bg-amber-400"
            : slot.kind === "ai"
              ? "bg-blue-400"
              : "bg-gray-600"
        }`}
      />

      {/* Name */}
      <div className="min-w-0 flex-1">
        {slot.kind === "human" ? (
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-white">{slot.playerName}</span>
            {isSlotHost && (
              <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-400">
                Host
              </span>
            )}
            {isMe && !isSlotHost && (
              <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-400">
                You
              </span>
            )}
          </div>
        ) : slot.kind === "ai" ? (
          <span className="text-sm text-blue-400">AI ({slot.aiStrategy})</span>
        ) : (
          <span className="text-sm italic text-gray-500">Waiting for player...</span>
        )}
      </div>

      {/* Ready status for humans */}
      {slot.kind === "human" && slot.connected && (
        <span
          className={`shrink-0 text-[10px] font-semibold uppercase ${
            slot.ready ? "text-emerald-400" : "text-gray-500"
          }`}
        >
          {slot.ready ? "Ready" : "Not ready"}
        </span>
      )}

      {/* Toggle AI/Open (host only, non-self slots) */}
      {canToggle && slot.kind !== "human" && (
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 rounded px-2 py-1 text-[10px] font-medium text-gray-400 transition-colors hover:bg-gray-700/50 hover:text-white"
        >
          {slot.kind === "ai" ? "Remove AI" : "Add AI"}
        </button>
      )}

      {/* Kick (host only) */}
      {canKick && (
        <button
          type="button"
          onClick={onKick}
          className="shrink-0 rounded px-2 py-1 text-[10px] font-medium text-red-400 transition-colors hover:bg-red-500/10"
        >
          Kick
        </button>
      )}
    </div>
  );
}
