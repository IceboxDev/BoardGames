import type { RoomSlot, RoomState } from "@boardgames/core/protocol";
import type { GameRoomConfig } from "@boardgames/core/protocol/room-config";
import { ControlGroup, SetupLayout } from "../setup";
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
  /** Host-only role swap (see `GameRoomConfig.seatNames` / `RoomState.seatOrder`). */
  onSwapSeats?: (a: number, b: number) => void;
  error?: string | null;
  children?: React.ReactNode;
  /**
   * `"wide"` renders the full-viewport, non-scrolling variant that mirrors
   * a game's solo SetupScreen: a compact room/crew/launch strip on top and
   * the game-specific config (`children`) filling the remaining height.
   * Games with a large lobby config surface (Sky Team's destination
   * gallery) opt in via `PlayableGame.lobbyLayout`; the default is the
   * classic centered scrolling column.
   */
  layout?: "default" | "wide";
  /** Game title for the wide layout's header strip. */
  title?: string;
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
  onSwapSeats,
  error,
  children,
  layout = "default",
  title,
}: LobbyProps) {
  const allHumansReady = roomState.slots.every((s) => s.kind !== "human" || s.ready);
  const humanCount = roomState.slots.filter((s) => s.kind === "human" && s.connected).length;
  const canStart = isHost && allHumansReady && humanCount >= roomConfig.minPlayers;

  const slotRows = roomState.slots.map((slot, i) => (
    <SlotRow
      // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional, no stable ID
      key={`slot-${i}-${slot.kind}-${slot.playerName ?? ""}`}
      slot={slot}
      index={i}
      isMe={i === mySlot}
      seatName={roomConfig.seatNames?.[roomState.seatOrder?.[i] ?? i]}
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
  ));

  // Host-only role swap — shown for games whose seats carry meaning
  // (Sky Team: Pilot / Co-Pilot). Two-seat rooms only; players keep their
  // slots, just the role assignment flips.
  const swapRolesButton =
    isHost && onSwapSeats && roomConfig.seatNames && roomState.slots.length === 2 ? (
      <Button
        variant="secondary"
        size="xs"
        onClick={() => onSwapSeats(0, 1)}
        className="self-center"
      >
        ⇅ Swap roles
      </Button>
    ) : null;

  const startOrReadyButton = isHost ? (
    <Button variant="primary" size="lg" block disabled={!canStart} onClick={onStart}>
      Start Game
      {!canStart && humanCount < roomConfig.minPlayers
        ? ` (need ${roomConfig.minPlayers} players)`
        : ""}
    </Button>
  ) : (
    <Button
      variant={roomState.slots[mySlot]?.ready ? "secondary" : "primary"}
      size="lg"
      block
      onClick={onToggleReady}
    >
      {roomState.slots[mySlot]?.ready ? "Not Ready" : "Ready"}
    </Button>
  );

  if (layout === "wide") {
    const launchStatus = isHost
      ? humanCount < roomConfig.minPlayers
        ? `Waiting for players (${humanCount}/${roomConfig.minPlayers} aboard)`
        : allHumansReady
          ? "All crew aboard and ready."
          : "Waiting for the crew to ready up."
      : roomState.slots[mySlot]?.ready
        ? "Ready — waiting for the host to start."
        : "Ready up when you're set.";

    return (
      <div className="relative z-10 flex h-full min-h-0 w-full flex-col overflow-hidden px-4 pb-4 pt-3 sm:px-6 sm:pb-5 sm:pt-4">
        <header className="mb-3 flex shrink-0 flex-wrap items-baseline gap-3">
          <h1 className="text-xl font-bold text-white sm:text-2xl">{title ?? "Multiplayer"}</h1>
          <p className="text-xs text-slate-400 sm:text-sm">
            Share the room code with a friend, ready up, and launch
          </p>
        </header>

        {error && <ErrorAlert message={error} className="mb-3 shrink-0" />}

        {/* Controls strip — same chrome and placement as the solo setup
            screen's Crew / AI / Launch strip, so the two screens mirror. */}
        <section className="grid shrink-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
          <ControlGroup label="Room Code">
            <div className="flex h-full flex-col items-center justify-center gap-1">
              <span className="font-mono text-3xl font-black tracking-[0.35em] text-emerald-400">
                {roomCode}
              </span>
              <span className="text-center text-[10px] text-slate-500">
                Friends join with this code
              </span>
            </div>
          </ControlGroup>

          <ControlGroup label="Crew">
            <div className="flex h-full flex-col justify-center gap-2">
              {slotRows}
              {swapRolesButton}
            </div>
          </ControlGroup>

          <ControlGroup label="Launch">
            <div className="flex h-full flex-col justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-white">
                  {canStart ? "Cleared for departure" : "Pre-flight checks"}
                </span>
                <span className="text-[10px] leading-tight text-slate-400">{launchStatus}</span>
              </div>
              <div className="flex flex-col items-stretch gap-1">
                {startOrReadyButton}
                <Button variant="link" onClick={onLeave}>
                  Leave Room
                </Button>
              </div>
            </div>
          </ControlGroup>
        </section>

        {/* Game-specific config (e.g. Sky Team's destination gallery) gets
            all leftover height, exactly like the solo screen's gallery. */}
        <section className="mt-4 flex min-h-0 flex-1 flex-col gap-2">{children}</section>
      </div>
    );
  }

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
      <div className="mx-auto mb-6 flex w-full max-w-md flex-col gap-2">
        <div className="text-xs font-medium uppercase tracking-wider text-fg-secondary">
          Players
        </div>
        {slotRows}
        {swapRolesButton}
      </div>

      {/* Game-specific config */}
      {children}

      {/* Actions */}
      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        {startOrReadyButton}

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
  seatName,
  canKick,
  canToggle,
  onKick,
  onToggle,
}: {
  slot: RoomSlot;
  index: number;
  isMe: boolean;
  /** Role attached to this seat index (e.g. "Pilot"), from `GameRoomConfig.seatNames`. */
  seatName?: string;
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

      {/* Seat role (Pilot / Co-Pilot) — fixed width so names line up. */}
      {seatName && (
        <Badge tone="neutral" className="w-16 justify-center">
          {seatName}
        </Badge>
      )}

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
