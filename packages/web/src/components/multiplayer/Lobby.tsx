import type { RoomSlot, RoomState } from "@boardgames/core/protocol";
import type { GameRoomConfig } from "@boardgames/core/protocol/room-config";
import { SetupLayout } from "../setup";
import { Badge, Button, Chip, ErrorAlert } from "../ui";

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
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-secondary">
          Room Code
        </div>
        <div className="inline-block rounded-xl border border-white/10 bg-surface-800/60 px-8 py-4">
          <span className="text-4xl font-bold tracking-[0.4em] text-emerald-400 sm:text-5xl">
            {roomCode}
          </span>
        </div>
        <p className="mt-2 text-xs text-fg-muted">Share this code with a friend to play together</p>
      </div>

      {error && <ErrorAlert message={error} className="mx-auto mb-4 w-full max-w-md text-center" />}

      {/* Player slots */}
      <div className="mx-auto mb-6 w-full max-w-md space-y-2">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-secondary">
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
          <Button variant="primary" size="lg" disabled={!canStart} onClick={onStart}>
            Start Game
            {!canStart && humanCount < roomConfig.minPlayers
              ? ` (need ${roomConfig.minPlayers} players)`
              : ""}
          </Button>
        ) : (
          <Button
            variant={roomState.slots[mySlot]?.ready ? "secondary" : "primary"}
            size="lg"
            onClick={onToggleReady}
          >
            {roomState.slots[mySlot]?.ready ? "Not Ready" : "Ready"}
          </Button>
        )}

        <Button variant="link" onClick={onLeave}>
          Leave Room
        </Button>
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
        isMe ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/10 bg-surface-800/30"
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
              ? "bg-sky-400"
              : "bg-fg-disabled"
        }`}
      />

      {/* Name */}
      <div className="min-w-0 flex-1">
        {slot.kind === "human" ? (
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-white">{slot.playerName}</span>
            {isSlotHost && <Badge tone="amber">Host</Badge>}
            {isMe && !isSlotHost && <Badge tone="emerald">You</Badge>}
          </div>
        ) : slot.kind === "ai" ? (
          <span className="text-sm text-sky-400">AI ({slot.aiStrategy})</span>
        ) : (
          <span className="text-sm italic text-fg-muted">Waiting for player...</span>
        )}
      </div>

      {/* Ready status for humans */}
      {slot.kind === "human" && slot.connected && (
        <span
          className={`shrink-0 text-3xs font-semibold uppercase ${
            slot.ready ? "text-emerald-400" : "text-fg-muted"
          }`}
        >
          {slot.ready ? "Ready" : "Not ready"}
        </span>
      )}

      {/* Toggle AI/Open (host only, non-self slots) */}
      {canToggle && slot.kind !== "human" && (
        <Chip
          pressed={false}
          tone="accent"
          size="xs"
          onClick={onToggle}
          className="shrink-0 uppercase"
        >
          {slot.kind === "ai" ? "Remove AI" : "Add AI"}
        </Chip>
      )}

      {/* Kick (host only) */}
      {canKick && (
        <Button variant="danger" size="xs" onClick={onKick} className="shrink-0 uppercase">
          Kick
        </Button>
      )}
    </div>
  );
}
