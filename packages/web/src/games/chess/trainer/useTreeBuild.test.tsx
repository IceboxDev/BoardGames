import type { RepertoireTree } from "@boardgames/core/games/chess/trainer/tree";
import { TreeSettingsSchema } from "@boardgames/core/games/chess/trainer/tree";
import type { Repertoire } from "@boardgames/core/protocol";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FromWorker, ToWorker } from "./build.worker";
import { useTreeBuild } from "./useTreeBuild";

vi.mock("./api", () => ({
  chessKeys: { repertoire: (id: string) => ["rep", id], repertoires: ["reps"] },
  fetchAllGames: vi.fn(async () => []),
  saveRepertoire: vi.fn(async () => ({ version: 2 })),
}));
vi.mock("./engine-provider", () => ({
  TrainerProviders: class {
    engineLines = vi.fn(async () => []);
    popularMoves = vi.fn(async () => [{ uci: "e7e5", games: 10 }]);
    dispose() {}
  },
}));

/** The build worker, played by the test: it records what the page sends. */
class FakeWorker {
  static last: FakeWorker | null = null;
  readonly sent: ToWorker[] = [];
  private readonly listeners = new Set<(e: MessageEvent<FromWorker>) => void>();
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(m: ToWorker) {
    this.sent.push(m);
    if (m.type === "load") queueMicrotask(() => this.emit({ type: "loaded", hit: true }));
  }
  addEventListener(_: string, f: (e: MessageEvent<FromWorker>) => void) {
    this.listeners.add(f);
  }
  removeEventListener(_: string, f: (e: MessageEvent<FromWorker>) => void) {
    this.listeners.delete(f);
  }
  emit(data: FromWorker) {
    for (const f of [...this.listeners]) f({ data } as MessageEvent<FromWorker>);
  }
  terminate() {}
  sentOf(type: ToWorker["type"]) {
    return this.sent.filter((m) => m.type === type);
  }
}

const rep: Repertoire = {
  id: "r1",
  name: "White",
  color: "w",
  status: "generating",
  stats: null,
  version: 1,
  updatedAt: "2026-10-20T00:00:00Z",
  settings: TreeSettingsSchema.parse({}),
  tree: null,
};
const tree = { nodes: {} } as unknown as RepertoireTree;

beforeEach(() => vi.stubGlobal("Worker", FakeWorker));
afterEach(() => vi.unstubAllGlobals());

describe("useTreeBuild", () => {
  it("runs one build at a time: a second ask stops the first and starts after it", async () => {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useTreeBuild(rep, "token", "1:x", "w"), { wrapper });

    act(() => result.current.build());
    await waitFor(() => expect(FakeWorker.last?.sentOf("build")).toHaveLength(1));
    const w = FakeWorker.last as FakeWorker;

    act(() => result.current.build());
    expect(w.sentOf("stop")).toHaveLength(1);
    expect(w.sentOf("build")).toHaveLength(1);

    // The running build's questions get one answer each.
    await act(async () => w.emit({ type: "ask-popular", id: 1, fen: "x" }));
    await waitFor(() => expect(w.sentOf("answer")).toHaveLength(1));

    await act(async () => w.emit({ type: "done", tree, pending: [] }));
    await waitFor(() => expect(w.sentOf("build")).toHaveLength(2));
    expect(result.current.phase).toBe("building");

    // The second build is still heard: its questions are answered, its end is seen.
    await act(async () => w.emit({ type: "ask-popular", id: 2, fen: "x" }));
    await waitFor(() => expect(w.sentOf("answer")).toHaveLength(2));
    await act(async () => w.emit({ type: "done", tree, pending: [] }));
    await waitFor(() => expect(result.current.phase).toBe("idle"));
    expect(w.sentOf("build")).toHaveLength(2);
  });
});
