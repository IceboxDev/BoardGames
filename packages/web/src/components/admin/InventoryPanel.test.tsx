import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveInventoryEntry } from "../../lib/resolve-inventory-entry.ts";

// The admin's New-in-library toggle sits beside each OWNED game and acts
// immediately (it edits the copy's acquisition date server-side), separate
// from the drafted slug list — a game only ticked in the draft has no copy to
// date yet, so it gets no toggle until the inventory is saved.

const fetchInventoryMock = vi.fn();
const saveInventoryMock = vi.fn();
const fetchNewMock = vi.fn();
const setNewMock = vi.fn();
vi.mock("../../lib/inventory", () => ({
  adminFetchInventory: (...args: unknown[]) => fetchInventoryMock(...args),
  adminSaveInventory: (...args: unknown[]) => saveInventoryMock(...args),
  adminFetchNewSlugs: (...args: unknown[]) => fetchNewMock(...args),
  adminSetInventoryNew: (...args: unknown[]) => setNewMock(...args),
}));

import { InventoryPanel } from "./InventoryPanel";

const WINGSPAN = resolveInventoryEntry("wingspan").title;
const AZUL = resolveInventoryEntry("azul").title;

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <InventoryPanel userId="u1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchInventoryMock.mockResolvedValue(["wingspan"]);
  fetchNewMock.mockResolvedValue([]);
  setNewMock.mockResolvedValue(["wingspan"]);
});

describe("InventoryPanel — New marker", () => {
  it("offers the toggle only beside saved games, and reflects the server's set", async () => {
    fetchNewMock.mockResolvedValue(["wingspan"]);
    renderPanel();
    const toggle = await screen.findByRole("button", { name: `Unmark ${WINGSPAN} as new` });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /Mark .* as new/ })).toBeNull();
    // Azul is not owned: no toggle, even after ticking it in the draft.
    expect(screen.queryByRole("button", { name: `Mark ${AZUL} as new` })).toBeNull();
    await userEvent.click(screen.getByRole("checkbox", { name: new RegExp(`^${AZUL}`) }));
    expect(screen.queryByRole("button", { name: `Mark ${AZUL} as new` })).toBeNull();
  });

  it("marks a game new without touching the drafted inventory", async () => {
    renderPanel();
    const toggle = await screen.findByRole("button", { name: `Mark ${WINGSPAN} as new` });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    await waitFor(() => expect(setNewMock).toHaveBeenCalledWith("u1", "wingspan", true));
    expect(
      await screen.findByRole("button", { name: `Unmark ${WINGSPAN} as new` }),
    ).toHaveAttribute("aria-pressed", "true");
    // The slug list itself stayed clean — the New toggle is not an inventory edit.
    expect(saveInventoryMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save inventory" })).toBeDisabled();
  });
});
