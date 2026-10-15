/**
 * A whole online Clocktower evening through the real room and session
 * managers: seven sockets (a Storyteller and six players) make a room, the
 * Storyteller deals, every socket gets its own view, a night wakes one player,
 * the day runs a timed vote on fake timers, and the game ends with the
 * Storyteller recorded as the moderator. What each socket RECEIVED is what is
 * checked — the wire, not the state.
 */

import type { BotcView } from "@boardgames/core/games/blood-on-the-clocktower/online/view";
import { BotcViewSchema } from "@boardgames/core/games/blood-on-the-clocktower/online/view";
import type { WSContext } from "hono/ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../matches/store.ts", () => ({ saveMatch: vi.fn(async () => 1) }));
vi.mock("../matches/companion-store.ts", () => ({ saveCompanionRecord: vi.fn(async () => null) }));

const { handleWsMessage, wsAuth } = await import("./manager.ts");
const { handleCreateRoom, handleJoinRoom, handleStartRoom, handleToggleReady, resetRoomsForTests } =
  await import("./room-manager.ts");

interface Sock {
  ws: WSContext;
  sent: { type: string; [key: string]: unknown }[];
}

function socket(userId: string): Sock {
  const sent: Sock["sent"] = [];
  const ws = {
    readyState: 1,
    send: (data: string) => sent.push(JSON.parse(data)),
  } as unknown as WSContext;
  wsAuth.set(ws, userId);
  return { ws, sent };
}

/** The newest view this socket received. */
function view(s: Sock): BotcView {
  const frame = [...s.sent]
    .reverse()
    .find((m) => m.type === "state-update" || m.type === "game-started" || m.type === "game-over");
  if (!frame) throw new Error("no view yet");
  return BotcViewSchema.parse(frame.playerView);
}

function lastError(s: Sock): string | undefined {
  return [...s.sent].reverse().find((m) => m.type === "error")?.message as string | undefined;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  resetRoomsForTests();
  vi.useRealTimers();
});

describe("an online Clocktower room", () => {
  it("runs from the lobby to a moderated game over, each socket seeing only its own", async () => {
    const st = socket("st");
    handleCreateRoom(st.ws, { gameSlug: "blood-on-the-clocktower", playerName: "Story" });
    const code = [...st.sent].find((m) => m.type === "room-created")?.roomCode as string;
    const players = Array.from({ length: 6 }, (_, i) => socket(`p${i + 1}`));
    players.forEach((p, i) => {
      handleJoinRoom(p.ws, { roomCode: code, playerName: `P${i + 1}` });
      handleToggleReady(p.ws, { roomCode: code });
    });
    handleStartRoom(st.ws, { roomCode: code, config: {} });

    const started = [...st.sent].find((m) => m.type === "game-started");
    expect(started).toBeDefined();
    const sessionId = started?.sessionId as string;
    const act = (s: Sock, action: unknown) =>
      handleWsMessage(s.ws, {
        type: "action",
        sessionId,
        action: { type: "PLAYER_ACTION", action },
      } as never);
    const stAct = (action: Record<string, unknown>) => {
      const v = view(st);
      if (v.role !== "storyteller") throw new Error("seat 0 should be the Storyteller");
      act(st, { ...action, rev: v.rev });
    };

    expect(view(st).role).toBe("storyteller");
    expect(view(players[0] as Sock).role).toBe("player");
    expect(view(st).names).toEqual(["Story", "P1", "P2", "P3", "P4", "P5", "P6"]);

    // A player can't deal.
    act(players[0] as Sock, { kind: "deal", rev: 0 });
    expect(lastError(players[0] as Sock)).toBe("Only the Storyteller can do that");

    stAct({ kind: "deal" });
    stAct({ kind: "reveal-characters" });
    const stView = view(st);
    if (stView.role !== "storyteller" || !stView.companion) throw new Error("not dealt");
    for (const p of players) {
      const v = view(p);
      if (v.role !== "player") throw new Error("player view expected");
      const truth = stView.companion.players.find((x) => x.roomSeat === v.you);
      expect(v.me.shown?.character).toBe(truth?.believedCharacter ?? truth?.character);
      // Nobody else's character is on the wire to this socket.
      expect(JSON.stringify(v)).not.toContain('"companion"');
      act(p, { kind: "ack-character" });
    }
    stAct({ kind: "begin-night" });
    expect(view(st).phase).toEqual({ kind: "night", number: 1 });

    // Public chat is closed at night; a whisper to the Storyteller isn't.
    act(players[1] as Sock, { kind: "chat", text: "anyone up?" });
    expect(lastError(players[1] as Sock)).toBe("The town is asleep");
    act(players[1] as Sock, { kind: "whisper", to: 0, text: "I'm nervous" });
    const stWhispers = view(st);
    expect(stWhispers.role === "storyteller" && stWhispers.whispers.at(-1)?.text).toBe(
      "I'm nervous",
    );

    stAct({ kind: "dawn" });
    stAct({ kind: "nominations", open: true });
    const [a, b] = players as [Sock, Sock];
    act(a, { kind: "nominate", nominee: view(b).you });
    const vote = view(st).day.vote;
    expect(vote?.nominee).toBe(view(b).you);
    for (const p of players) act(p, { kind: "hand", up: true });
    stAct({ kind: "start-vote" });
    await vi.advanceTimersByTimeAsync(1500 * (vote?.order.length ?? 0) + 100);
    expect(view(a).day.vote?.status).toBe("done");
    stAct({ kind: "confirm-vote" });
    expect(view(a).day.vote?.result?.votes).toBe(6);
    stAct({ kind: "execute" });
    expect(view(a).town.find((t) => t.seat === view(b).you)?.alive).toBe(false);

    stAct({ kind: "end-game", winner: "good", reason: "the Demon was executed" });
    // The match is saved before the game-over frame goes out.
    await vi.waitFor(() => expect(a.sent.some((m) => m.type === "game-over")).toBe(true));
    const over = [...a.sent].reverse().find((m) => m.type === "game-over");
    expect(over?.outcome).toMatchObject({ kind: "teams", winningTeam: 0, moderatorSeats: [0] });
    const reveal = view(a);
    expect(reveal.role === "player" && reveal.reveal?.grimoire.players).toHaveLength(6);
  });
});
