import { type CompanionRecordEntry, CompanionRecordListSchema } from "@boardgames/core/protocol";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// The companions' Match History: the same list kit as online games, a row per
// game the member ran, and the picked row's who-was-what dialog.

const entries = vi.hoisted(() => ({ current: [] as unknown[] }));
vi.mock("../../lib/companion-records", () => ({
  companionRecordsQueryFn: () => async () => entries.current,
  useCompanionRecordOutbox: () => ({ pendingCount: 1 }),
}));

const { default: ClocktowerMatchHistory } = await import(
  "../../games/blood-on-the-clocktower/ClocktowerMatchHistory"
);
const { default: DndMatchHistory } = await import(
  "../../games/dungeons-and-dragons/DndMatchHistory"
);

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function list(raw: unknown[]): CompanionRecordEntry[] {
  return CompanionRecordListSchema.parse(raw);
}

describe("Clocktower Match History", () => {
  it("lists games run and opens who was what", async () => {
    entries.current = list([
      {
        id: 7,
        clientId: "game-0001",
        recordedAt: "2026-10-10 20:00:00",
        record: {
          game: "blood-on-the-clocktower",
          edition: "trouble-brewing",
          storyteller: "Mantas",
          players: ["Ana", "Ben", "Cleo", "Dan", "Eve"].map((name, seat) => ({
            seat,
            name,
            character: seat === 0 ? "imp" : seat === 1 ? "poisoner" : "empath",
            alignment: seat < 2 ? "evil" : "good",
            alive: seat !== 3,
          })),
          winner: "evil",
          reason: "two players remain",
          days: 3,
          startedAt: "2026-10-10T19:00:00.000Z",
          endedAt: "2026-10-10T20:15:00.000Z",
        },
      },
    ]);
    wrap(<ClocktowerMatchHistory onBack={() => {}} />);

    const row = await screen.findByRole("row", { name: /Evil won/ });
    expect(within(row).getByText("Trouble Brewing")).toBeTruthy();
    expect(within(row).getByText("1 h 15 min")).toBeTruthy();
    expect(screen.getByText(/1 game is waiting to sync/)).toBeTruthy();

    await userEvent.click(row);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Two players remain/)).toBeTruthy();
    expect(within(dialog).getByText("Ana")).toBeTruthy();
    expect(within(dialog).getByText("Imp")).toBeTruthy();
    expect(within(dialog).getByText(/Storyteller: Mantas/)).toBeTruthy();
  });
});

describe("D&D Match History", () => {
  it("lists sessions run and opens who was in the party", async () => {
    entries.current = list([
      {
        id: 3,
        clientId: "session-01",
        recordedAt: "2026-10-10 22:00:00",
        record: {
          game: "dungeons-and-dragons",
          campaignId: "c1",
          campaignTitle: "Lost Mine",
          campaignKind: "campaign",
          partyId: "p1",
          partyName: "Tuesday",
          members: [
            {
              characterId: "ch1",
              name: "Thorin",
              playerName: "Ben",
              race: "Dwarf",
              class: "Fighter",
              level: 3,
            },
          ],
          waypoint: { index: 1, of: 6, title: "Cragmaw Hideout" },
          loggedEntries: 12,
          startedAt: "2026-10-10T18:00:00.000Z",
          endedAt: "2026-10-10T21:00:00.000Z",
        },
      },
    ]);
    wrap(<DndMatchHistory onBack={() => {}} />);

    const row = await screen.findByRole("row", { name: /Lost Mine/ });
    expect(within(row).getByText("Tuesday (1)")).toBeTruthy();
    expect(within(row).getByText("Cragmaw Hideout (2 of 6)")).toBeTruthy();
    expect(within(row).getByText("3 h")).toBeTruthy();

    await userEvent.click(row);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Thorin")).toBeTruthy();
    expect(within(dialog).getByText("Dwarf Fighter 3 · Ben")).toBeTruthy();
    expect(within(dialog).getByText(/12 entries logged/)).toBeTruthy();
  });
});
