import type { GameOutcome } from "@boardgames/core/machines/outcome";
import type { SeatRequest } from "@boardgames/core/machines/seats";
import { roomSeating } from "@boardgames/core/protocol";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GameOverAction } from "../components/game-over/GameOverLayout";
import type { GameSource } from "./useGameShell";
import { useGameShell } from "./useGameShell";

/** What a game component renders right now. */
export type SessionPhase =
  /** Solo, before a game: the setup screen. */
  | "setup"
  /** A start (solo) or the room's game is on its way. */
  | "waiting"
  | "playing"
  | "finished";

/** Who sits at one seat, as the flow knows it. */
export interface SeatInfo {
  /** A person's room name ("You" in a solo game), or an AI's strategy label. */
  readonly name: string;
  readonly kind: "human" | "ai";
}

/** A solo game's seats (this player holds every human seat) and options. */
export interface SoloStart {
  readonly seats: readonly SeatRequest[];
  readonly config?: unknown;
}

export interface SessionFlow<TView, TAction, TResult, TSetup> {
  readonly source: GameSource;
  readonly phase: SessionPhase;
  /** The live view — or, once the game is over, the last one (for the final board). */
  readonly view: TView | null;
  readonly legalActions: TAction[];
  readonly result: TResult | null;
  /** How the game ended, in the shape every game shares; `null` until it has. */
  readonly outcome: GameOutcome | null;
  /** The seat this player plays. */
  readonly seat: number;
  readonly activePlayer: number;
  readonly isMyTurn: boolean;
  readonly isAiThinking: boolean;
  readonly error: string | null;
  /**
   * Who sits at each seat: people by their room name (or "You" in a solo
   * game), AI seats by their strategy's label. Follows the room's seat order,
   * so a swapped Pilot/Co-Pilot is named right.
   */
  readonly seats: readonly SeatInfo[];
  /** `seats`' names, by seat. */
  readonly seatNames: readonly string[];
  /** Solo: start a game from the setup screen's choice (remembered for Play Again). */
  readonly start: (setup: TSetup) => void;
  /** Solo: the same setup again; `null` in rooms or before a first game. */
  readonly playAgain: (() => void) | null;
  /** Solo: back to the setup screen; `null` in rooms. */
  readonly changeSetup: (() => void) | null;
  /** Leave the game (solo or room) for the game's menu. */
  readonly backToMenu: () => void;
  /** Open the finished game's replay; `null` when the game has no viewer or no saved replay. */
  readonly viewReplay: (() => void) | null;
  /**
   * The game-over buttons, the same in every game: solo — Play Again, Change
   * Setup; room — Back to Menu; both — View replay when there is one.
   */
  readonly endActions: readonly GameOverAction[];
  /**
   * Play one of `legalActions`. `seat` claims one of this player's human seats
   * in a solo game where they hold several (Pandemic's roles); rooms ignore it.
   */
  readonly sendAction: (action: TAction, seat?: number) => void;
}

export interface SessionFlowOptions<TSetup> {
  /**
   * Turn the game's setup-screen choice into seats and options. Omit for games
   * with no solo server game (Set and Quiztopia solo are local trainers).
   */
  readonly toSoloStart?: (setup: TSetup) => SoloStart;
  /**
   * A solo game with nothing to set up (Parks: one AI, no options): the start
   * it always makes. It begins at once and offers no "Change Setup".
   */
  readonly autoStart?: () => SoloStart;
}

/**
 * The session flow every game component shares: solo setup → waiting → play →
 * finished, the same for a room (without the setup). Games render per phase
 * and never touch the transport, the seat mapping or the navigation.
 */
export function useSessionFlow<TView, TAction, TResult, TSetup = never>(
  source: GameSource,
  { toSoloStart, autoStart }: SessionFlowOptions<TSetup> = {},
): SessionFlow<TView, TAction, TResult, TSetup> {
  const navigate = useNavigate();
  const { def, game, mp } = useGameShell<TView, TAction, TResult>();
  const active = source === "mp" ? mp : game;

  const [lastStart, setLastStart] = useState<SoloStart | null>(null);
  // The error showing when a start was sent — a start is in flight until the
  // game arrives or a *new* error (the server refusing it) replaces that one.
  const [starting, setStarting] = useState<{ errorBefore: string | null } | null>(null);
  useEffect(() => {
    if (starting && (game.view !== null || game.error !== starting.errorBefore)) setStarting(null);
  }, [starting, game.view, game.error]);

  // Keep the last view so a finished game can still show its final board.
  const lastView = useRef<TView | null>(null);
  if (active.view !== null) lastView.current = active.view;

  const launch = useCallback(
    (soloStart: SoloStart) => {
      setLastStart(soloStart);
      setStarting({ errorBefore: game.error });
      lastView.current = null;
      game.start(soloStart.seats, soloStart.config);
    },
    [game.error, game.start],
  );

  const start = useCallback(
    (setup: TSetup) => {
      if (!toSoloStart) throw new Error(`${def.slug} has no solo game to start`);
      launch(toSoloStart(setup));
    },
    [toSoloStart, def.slug, launch],
  );

  const backToMenu = useCallback(() => {
    if (source === "mp") mp.reset();
    else game.reset();
    navigate(`/play/${def.slug}`);
  }, [source, mp.reset, game.reset, def.slug, navigate]);

  const changeSetup = useCallback(() => {
    lastView.current = null;
    game.reset();
  }, [game.reset]);

  const seats = useMemo((): SeatInfo[] => {
    const ai = (strategy: string | undefined): SeatInfo => {
      const info = def.manifest?.strategies.find((s) => s.id === strategy);
      return { name: info ? `${info.label} (AI)` : "AI", kind: "ai" };
    };
    if (source === "mp") {
      const room = mp.roomState;
      if (!room) return [];
      return roomSeating(room.slots, room.seatOrder).map((slotIndex) => {
        const slot = room.slots[slotIndex];
        return slot?.kind === "ai"
          ? ai(slot.aiStrategy)
          : { name: slot?.playerName ?? "Player", kind: "human" };
      });
    }
    return (lastStart?.seats ?? []).map((seat) =>
      seat.kind === "ai" ? ai(seat.strategy) : { name: "You", kind: "human" },
    );
  }, [source, mp.roomState, lastStart, def.manifest]);
  const seatNames = useMemo(() => seats.map((s) => s.name), [seats]);

  const autoStartNow =
    autoStart !== undefined &&
    source === "solo" &&
    starting === null &&
    game.view === null &&
    game.result === null;
  useEffect(() => {
    if (autoStartNow && autoStart) launch(autoStart());
  }, [autoStartNow, autoStart, launch]);

  const phase: SessionPhase =
    active.result !== null
      ? "finished"
      : active.view !== null
        ? "playing"
        : source === "solo" && starting === null && !autoStart
          ? "setup"
          : "waiting";

  const viewReplay =
    phase === "finished" && active.replayId !== null && def.replayComponent
      ? () => navigate(`/play/${def.slug}/match-history/${active.replayId}`)
      : null;

  const playAgain = source === "solo" && lastStart ? () => launch(lastStart) : null;
  const endActions: GameOverAction[] = [
    ...(source === "solo"
      ? [
          ...(playAgain
            ? [{ label: "Play Again", variant: "primary" as const, onClick: playAgain }]
            : []),
          ...(autoStart
            ? [{ label: "Back to Menu", variant: "secondary" as const, onClick: backToMenu }]
            : [{ label: "Change Setup", variant: "secondary" as const, onClick: changeSetup }]),
        ]
      : [{ label: "Back to Menu", variant: "primary" as const, onClick: backToMenu }]),
    ...(viewReplay
      ? [{ label: "View Replay", variant: "secondary" as const, onClick: viewReplay }]
      : []),
  ];

  return {
    source,
    phase,
    view: active.view ?? lastView.current,
    legalActions: active.legalActions,
    result: active.result,
    outcome: active.outcome,
    seat: active.playerIndex,
    activePlayer: active.activePlayer,
    isMyTurn: active.isMyTurn,
    isAiThinking: active.isAiThinking,
    error: active.error,
    seats,
    seatNames,
    start,
    playAgain,
    changeSetup: source === "solo" && !autoStart ? changeSetup : null,
    backToMenu,
    viewReplay,
    endActions,
    sendAction: source === "mp" ? (action) => mp.send(action) : game.send,
  };
}

/** One person against `seats − 1` copies of one AI — most games' solo table. */
export function againstAi(seats: number, strategy: string): SeatRequest[] {
  return [
    { kind: "human" },
    ...Array.from({ length: seats - 1 }, (): SeatRequest => ({ kind: "ai", strategy })),
  ];
}
