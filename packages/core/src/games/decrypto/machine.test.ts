import { afterEach, describe, expect, it } from "vitest";
import { type ActorRefFrom, createActor, waitFor } from "xstate";
import type { DecryptoAiAgent } from "./ai/agent";
import { setDecryptoAgent } from "./ai/agent";
import { decryptoMachine, decryptoSpec, phaseOf } from "./machine";
import { codesEqual } from "./rules";
import type { Code, DecryptoBeats, DecryptoMachineEvent } from "./types";

// Millisecond pacing so full games run in-process. clueTimeout is only used
// by the timer test.
const FAST: Partial<DecryptoBeats> = {
  roundStart: 1,
  aiBeat: 1,
  reveal: 1,
  roundEnd: 1,
  clueTimeout: 60,
};

type Actor = ActorRefFrom<typeof decryptoMachine>;

function startActor(event: Omit<DecryptoMachineEvent & { type: "START" }, "type">): Actor {
  const actor = createActor(decryptoMachine);
  actor.start();
  actor.send({ type: "START", beats: FAST, seed: 1234, ...event });
  return actor;
}

/**
 * Test agent: clues embed their digit ("k3 r2 s0"), so a "smart" guesser
 * recovers the exact code and a "rotate" guesser is wrong by construction
 * (a rotation of a distinct triple never equals itself).
 */
const scriptedAgent: DecryptoAiAgent = {
  encrypt: (input) =>
    Promise.resolve(
      input.code.map((digit, slot) => `k${digit} r${input.round} s${slot}`) as [
        string,
        string,
        string,
      ],
    ),
  guess: (input) => {
    const digits = input.currentClues.map((clue) => Number(/k(\d)/.exec(clue)?.[1] ?? "0")) as Code;
    if (input.model === "rotate") {
      return Promise.resolve([digits[1], digits[2], digits[0]] as Code);
    }
    return Promise.resolve(digits);
  },
};

function send(actor: Actor, player: number, action: unknown): { ok: boolean; reason?: string } {
  const validated = decryptoSpec.validateAction(actor.getSnapshot(), player, {
    type: "PLAYER_ACTION",
    action,
  });
  if (!validated.ok) return { ok: false, reason: validated.reason };
  actor.send(validated.event);
  return { ok: true };
}

async function waitForPhase(actor: Actor, phase: string): Promise<void> {
  await waitFor(actor, (s) => phaseOf(s) === phase, { timeout: 5000 });
}

async function waitForGameOver(actor: Actor): Promise<void> {
  await waitFor(actor, (s) => decryptoSpec.isGameOver(s), { timeout: 10_000 });
}

afterEach(() => {
  setDecryptoAgent(null);
});

describe("decrypto machine — AI-vs-AI soaks", () => {
  it("all-fallback standard game terminates by round 2 with a decided result", async () => {
    // The deterministic fallback can't decode, so both teams collect two
    // miscommunications by round 2 and the points tiebreak resolves it.
    const actor = startActor({ humanPlayers: [] });
    await waitForGameOver(actor);
    const snapshot = actor.getSnapshot();
    const result = decryptoSpec.getResult(snapshot);
    expect(result).not.toBeNull();
    expect(result?.rounds).toBe(2);
    expect(snapshot.context.teams[0].miscommunications).toBe(2);
    expect(snapshot.context.teams[1].miscommunications).toBe(2);
    const log = decryptoSpec.getReplayLog?.(snapshot) as { keywords: unknown[] } | null;
    expect(log).not.toBeNull();
    expect(log?.keywords).toHaveLength(2);
    actor.stop();
  });

  it("perfect play on both sides: mutual interceptions, shared victory in round 3", async () => {
    setDecryptoAgent(scriptedAgent);
    const actor = startActor({
      humanPlayers: [],
      aiModels: ["smart", "smart", "smart", "smart"],
    });
    await waitForGameOver(actor);
    const snapshot = actor.getSnapshot();
    const result = decryptoSpec.getResult(snapshot);
    // Round 1 has no interceptions; rounds 2 and 3 are both intercepted by
    // both sides. Decodes are always exact, so nobody miscommunicates.
    expect(snapshot.context.teams[0].interceptions).toBe(2);
    expect(snapshot.context.teams[1].interceptions).toBe(2);
    expect(snapshot.context.teams[0].miscommunications).toBe(0);
    expect(result).toMatchObject({ reason: "shared", rounds: 3 });
    expect(result?.winner).toBeUndefined();
    actor.stop();
  });

  it("interceptor variant: a blind interceptor loses to a team that survives 5 rounds", async () => {
    setDecryptoAgent(scriptedAgent);
    const actor = startActor({
      variant: "interceptor",
      humanPlayers: [],
      aiModels: ["smart", "smart", "rotate"],
    });
    await waitForGameOver(actor);
    const result = decryptoSpec.getResult(actor.getSnapshot());
    expect(result).toMatchObject({ winner: 0, reason: "survived", rounds: 5 });
    actor.stop();
  });

  it("interceptor variant: a sharp interceptor wins with 2 tokens by round 3", async () => {
    setDecryptoAgent(scriptedAgent);
    const actor = startActor({
      variant: "interceptor",
      humanPlayers: [],
      aiModels: ["smart", "smart", "smart"],
    });
    await waitForGameOver(actor);
    const result = decryptoSpec.getResult(actor.getSnapshot());
    expect(result).toMatchObject({ winner: 1, reason: "interceptor-tokens", rounds: 3 });
    actor.stop();
  });
});

describe("decrypto machine — human flow", () => {
  it("plays a full human round: clues, guesses, tokens, note sheet", async () => {
    const actor = startActor({ humanPlayers: [0, 1, 2, 3] });
    await waitForPhase(actor, "clueWriting");

    // Round 1 encryptors are seats 0 (White) and 2 (Black).
    expect(send(actor, 0, { kind: "submit-clues", clues: ["alpha", "beta", "gamma"] }).ok).toBe(
      true,
    );
    // Double submission has nothing pending.
    const dup = send(actor, 0, { kind: "submit-clues", clues: ["x", "y", "z"] });
    expect(dup.ok).toBe(false);
    expect(send(actor, 2, { kind: "submit-clues", clues: ["one", "two", "three"] }).ok).toBe(true);

    await waitForPhase(actor, "guessing");
    let ctx = actor.getSnapshot().context;
    const whiteCode = ctx.current[0]?.code as Code;

    // Round 1: no interception attempts exist.
    expect(decryptoSpec.getLegalActions(actor.getSnapshot(), 3)).toHaveLength(0);

    // Seat 1 drafts, then deliberately commits a WRONG decode.
    expect(send(actor, 1, { kind: "set-draft", purpose: "decode", slot: 0, digit: 1 }).ok).toBe(
      true,
    );
    const wrong = ([1, 2, 3] as Code).every((d, i) => d === whiteCode[i])
      ? ([2, 1, 3] as Code)
      : ([1, 2, 3] as Code);
    expect(send(actor, 1, { kind: "submit-guess", purpose: "decode", code: wrong }).ok).toBe(true);
    // Committed — the enumeration is now empty for seat 1.
    expect(send(actor, 1, { kind: "submit-guess", purpose: "decode", code: wrong }).ok).toBe(false);

    // Black's transmission: seat 3 decodes it EXACTLY (test reads the code).
    await waitFor(actor, (s) => s.context.txIdx === 1 && phaseOf(s) === "guessing", {
      timeout: 5000,
    });
    ctx = actor.getSnapshot().context;
    const blackCode = [...(ctx.current[1]?.code as Code)] as Code;
    expect(send(actor, 3, { kind: "submit-guess", purpose: "decode", code: blackCode }).ok).toBe(
      true,
    );

    await waitFor(actor, (s) => s.context.history.length === 1, { timeout: 5000 });
    ctx = actor.getSnapshot().context;
    expect(ctx.teams[0].miscommunications).toBe(1); // White decoded wrong
    expect(ctx.teams[1].miscommunications).toBe(0);
    expect(ctx.teams[0].interceptions).toBe(0);

    // The note sheet now shows round 1's revealed clues for both teams.
    const view = decryptoSpec.getPlayerView(actor.getSnapshot(), 0);
    const whiteRevealed = view.noteSheet[0].flat();
    expect(whiteRevealed.map((c) => c.clue).sort()).toEqual(["alpha", "beta", "gamma"]);
    actor.stop();
  });

  it("chat is team-scoped and locked for a live encryptor", async () => {
    const actor = startActor({ humanPlayers: [0, 1, 2, 3] });
    await waitForPhase(actor, "clueWriting");

    // Seat 0 is White's encryptor with a live transmission — locked out.
    const locked = send(actor, 0, { kind: "chat", text: "psst, it's my code" });
    expect(locked.ok).toBe(false);
    expect(locked.reason).toContain("encryptor");

    expect(send(actor, 1, { kind: "chat", text: "thinking birds?" }).ok).toBe(true);
    const teammate = decryptoSpec.getPlayerView(actor.getSnapshot(), 1);
    expect(teammate.chat.map((m) => m.text)).toContain("thinking birds?");
    // The opposing team never sees it.
    const opponent = decryptoSpec.getPlayerView(actor.getSnapshot(), 3);
    expect(opponent.chat).toHaveLength(0);
    // The locked encryptor doesn't see this round's messages either.
    const encryptor = decryptoSpec.getPlayerView(actor.getSnapshot(), 0);
    expect(encryptor.chat).toHaveLength(0);
    actor.stop();
  });

  it("redacts codes, keywords, and committed guesses per seat", async () => {
    const actor = startActor({ humanPlayers: [0, 1, 2, 3] });
    await waitForPhase(actor, "clueWriting");

    const encryptorView = decryptoSpec.getPlayerView(actor.getSnapshot(), 0);
    const teammateView = decryptoSpec.getPlayerView(actor.getSnapshot(), 1);
    const opponentView = decryptoSpec.getPlayerView(actor.getSnapshot(), 2);

    // Encryptor sees the code; nobody else does.
    expect(encryptorView.transmissions[0]?.code).not.toBeNull();
    expect(teammateView.transmissions[0]?.code).toBeNull();
    expect(opponentView.transmissions[0]?.code).toBeNull();

    // Keywords: own team only, and never the opponent's.
    const ctx = actor.getSnapshot().context;
    expect(teammateView.myKeywords).toEqual(ctx.teams[0].keywords);
    expect(opponentView.myKeywords).toEqual(ctx.teams[1].keywords);

    // No result leaks before game over, and the replay log stays null.
    expect(teammateView.result).toBeNull();
    expect(decryptoSpec.getReplayLog?.(actor.getSnapshot())).toBeNull();
    actor.stop();
  });

  it("rejects clue-rule violations with actionable reasons", async () => {
    const actor = startActor({ humanPlayers: [0, 1, 2, 3] });
    await waitForPhase(actor, "clueWriting");
    const keywords = actor.getSnapshot().context.teams[0].keywords as string[];

    const withKeyword = send(actor, 0, {
      kind: "submit-clues",
      clues: [`about ${keywords[0]}`, "two", "three"],
    });
    expect(withKeyword.ok).toBe(false);
    expect(withKeyword.reason).toContain("keyword");

    expect(send(actor, 0, { kind: "submit-clues", clues: ["mexico", "wings", "night"] }).ok).toBe(
      true,
    );

    // Duplicate clues within one submission are rejected too (Black's turn).
    const dup = send(actor, 2, { kind: "submit-clues", clues: ["echo", "echo", "three"] });
    expect(dup.ok).toBe(false);
    expect(dup.reason).toContain("identical");
    actor.stop();
  });

  it("rejects malformed and spoofed payloads without touching the actor", async () => {
    const actor = startActor({ humanPlayers: [0, 1, 2, 3] });
    await waitForPhase(actor, "clueWriting");
    const snapshot = actor.getSnapshot();

    expect(decryptoSpec.validateAction(snapshot, 1, null).ok).toBe(false);
    expect(decryptoSpec.validateAction(snapshot, 1, { type: "START" }).ok).toBe(false);
    expect(decryptoSpec.validateAction(snapshot, 1, { type: "PLAYER_ACTION", action: 42 }).ok).toBe(
      false,
    );
    expect(
      decryptoSpec.validateAction(snapshot, 1, {
        type: "PLAYER_ACTION",
        action: { kind: "explode" },
      }).ok,
    ).toBe(false);

    // A spoofed seat inside the payload is ignored — the event's player comes
    // from the authenticated argument only.
    const spoofed = decryptoSpec.validateAction(snapshot, 0, {
      type: "PLAYER_ACTION",
      player: 2,
      action: { kind: "submit-clues", clues: ["a", "b", "c"] },
    });
    expect(spoofed.ok).toBe(true);
    if (spoofed.ok) {
      expect((spoofed.event as { player: number }).player).toBe(0);
    }
    actor.stop();
  });
});

describe("decrypto machine — clue timer", () => {
  it("skips the slow human encryptor and charges a miscommunication", async () => {
    // Seats 0 and 2 are the round-1 encryptors, both human; AI fills 1 and 3.
    const actor = startActor({ humanPlayers: [0, 2], timerEnabled: true });
    await waitForPhase(actor, "clueWriting");

    expect(send(actor, 0, { kind: "submit-clues", clues: ["one", "two", "three"] }).ok).toBe(true);
    // The timer armed against the remaining HUMAN encryptor (seat 2).
    await waitFor(actor, (s) => s.context.clueTimerDeadlineTs !== null, { timeout: 5000 });

    // Let it expire; Black's transmission is skipped and resolves as a
    // miscommunication. White's own decode is AI-driven (seat 1).
    await waitFor(actor, (s) => s.context.history.length === 1, { timeout: 5000 });
    const ctx = actor.getSnapshot().context;
    const black = ctx.history[0]?.transmissions.find((t) => t.team === 1);
    expect(black?.skipped).toBe(true);
    expect(black?.resolved?.miscommunicated).toBe(true);
    expect(ctx.teams[1].miscommunications).toBe(1);
    actor.stop();
  });

  it("never arms against an AI encryptor", async () => {
    // Human seat 1 is NOT an encryptor in round 1 (seats 0 and 2 are, both AI).
    const actor = startActor({ humanPlayers: [1], timerEnabled: true });
    let sawDeadline = false;
    const sub = actor.subscribe((s) => {
      if (s.context.clueTimerDeadlineTs !== null) sawDeadline = true;
    });
    await waitFor(actor, (s) => phaseOf(s) === "guessing", { timeout: 5000 });
    expect(sawDeadline).toBe(false);
    sub.unsubscribe();
    actor.stop();
  });
});

describe("decrypto machine — sanity", () => {
  it("keeps activePlayer at -1 in-game and enumerates 24 codes for a guesser", async () => {
    setDecryptoAgent(scriptedAgent);
    const actor = startActor({ humanPlayers: [1], aiModels: ["smart", null, "smart", "smart"] });
    await waitForPhase(actor, "guessing");
    const snapshot = actor.getSnapshot();
    expect(decryptoSpec.getActivePlayer(snapshot)).toBe(-1);
    // Seat 1 decodes White's transmission: 15 draft actions + 24 codes.
    const legal = decryptoSpec.getLegalActions(snapshot, 1);
    expect(legal.filter((a) => a.kind === "submit-guess")).toHaveLength(24);
    expect(legal.filter((a) => a.kind === "set-draft")).toHaveLength(15);
    // Every enumerated code is distinct-digit.
    for (const a of legal) {
      if (a.kind === "submit-guess") expect(new Set(a.code).size).toBe(3);
    }
    // The code never appears in a non-encryptor's view.
    const view = decryptoSpec.getPlayerView(snapshot, 1);
    expect(view.transmissions[0]?.code).toBeNull();
    expect(codesEqual(snapshot.context.current[0]?.code ?? null, null)).toBe(false);
    actor.stop();
  });
});
