import type { AdminMemberNote, AdminOutstandingResponse } from "@boardgames/core/protocol";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { qk } from "../../lib/query-keys";
import type { AdminUser } from "./types";

// Under the availability calendar: what the member owes (from the server),
// the admins' notes on it, and the reminder that gathers both.

const fetchOutstanding = vi.fn<() => Promise<AdminOutstandingResponse>>();
const fetchNotes = vi.fn<() => Promise<AdminMemberNote[]>>();
const createNote = vi.fn<(userId: string, text: string) => Promise<AdminMemberNote>>();
const updateNote =
  vi.fn<(userId: string, id: number, patch: { done?: boolean }) => Promise<AdminMemberNote>>();
const deleteNote = vi.fn<(userId: string, id: number) => Promise<void>>();
vi.mock("../../lib/admin", () => ({
  adminFetchOutstanding: () => fetchOutstanding(),
  adminFetchMemberNotes: () => fetchNotes(),
  adminCreateMemberNote: (userId: string, text: string) => createNote(userId, text),
  adminUpdateMemberNote: (userId: string, id: number, patch: { done?: boolean }) =>
    updateNote(userId, id, patch),
  adminDeleteMemberNote: (userId: string, id: number) => deleteNote(userId, id),
}));

import { testQueryClient } from "../../test/query-client";
import { OutstandingSection } from "./OutstandingSection";

const USER = { id: "u1", name: "Klaudia Wachal", email: "k@example.com" } as AdminUser;

const note = (over: Partial<AdminMemberNote> = {}): AdminMemberNote => ({
  id: 1,
  text: "Bring back Brass",
  doneAt: null,
  createdAt: "2026-11-20 10:00:00",
  createdByName: "Admin",
  ...over,
});

function renderSection(blankDays = 0) {
  const qc = testQueryClient();
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <OutstandingSection user={USER} blankDays={blankDays} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return qc;
}

beforeEach(() => {
  fetchOutstanding.mockReset();
  fetchNotes.mockReset();
  createNote.mockReset();
  updateNote.mockReset();
  deleteNote.mockReset();
  fetchNotes.mockResolvedValue([]);
});

describe("OutstandingSection", () => {
  it("lists blank days and every item, each night linking to its card", async () => {
    fetchOutstanding.mockResolvedValue({
      members: {
        u1: {
          items: [
            { kind: "rsvp", dateKey: "2026-11-29", title: null, reason: "unconfirmed" },
            { kind: "purchase-vote", pollId: 1, title: null, votesLeft: 2, votesTotal: 3 },
          ],
          openNotes: 0,
        },
      },
    });
    renderSection(12);
    expect(await screen.findByText(/^RSVP for /)).toBeInTheDocument();
    expect(screen.getByText("12 days still blank")).toBeInTheDocument();
    expect(screen.getByText("2 of 3 purchase votes left")).toBeInTheDocument();
    expect(screen.getByText(/^RSVP for /).closest("a")).toHaveAttribute(
      "href",
      "/offline?date=2026-11-29",
    );
    const section = screen.getByRole("region", { name: "Outstanding" });
    expect(within(section).getByText("3")).toBeInTheDocument();
  });

  it("says when nothing is owed and keeps the reminder off", async () => {
    fetchOutstanding.mockResolvedValue({ members: { u1: { items: [], openNotes: 0 } } });
    renderSection(0);
    expect(await screen.findByText(/All caught up/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy reminder" })).toBeDisabled();
  });

  it("copies a reminder with the items and open notes", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    fetchOutstanding.mockResolvedValue({
      members: { u1: { items: [{ kind: "collection" }], openNotes: 1 } },
    });
    fetchNotes.mockResolvedValue([note()]);
    renderSection(0);
    await screen.findByText("Bring back Brass");
    await user.click(screen.getByRole("button", { name: "Copy reminder" }));
    expect(writeText).toHaveBeenCalledWith(
      [
        "Hey Klaudia! A few things still open for game night:",
        "• Add the games you own to your collection",
        "• Bring back Brass",
        `${window.location.origin}/offline`,
      ].join("\n"),
    );
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("adds a note, ticks it off into the done list and refreshes the table's count", async () => {
    const user = userEvent.setup();
    fetchOutstanding.mockResolvedValue({ members: { u1: { items: [], openNotes: 0 } } });
    createNote.mockImplementation(async (_u, text) => {
      // The server now holds it: the refetch after the save returns it too.
      fetchNotes.mockResolvedValue([note({ id: 7, text })]);
      return note({ id: 7, text });
    });
    updateNote.mockImplementation(async () => note({ id: 7, text: "Owes 5€", doneAt: "now" }));
    const qc = renderSection(0);
    const invalidate = vi.spyOn(qc, "invalidateQueries");

    await user.type(screen.getByRole("textbox", { name: "New note" }), "Owes 5€{Enter}");
    expect(createNote).toHaveBeenCalledWith("u1", "Owes 5€");
    expect(await screen.findByText("Owes 5€")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "New note" })).toHaveValue("");

    fetchNotes.mockResolvedValue([note({ id: 7, text: "Owes 5€", doneAt: "now" })]);
    await user.click(screen.getByRole("checkbox", { name: "Tick off: Owes 5€" }));
    expect(updateNote).toHaveBeenCalledWith("u1", 7, { done: true });
    expect(await screen.findByRole("button", { name: "Done (1)" })).toBeInTheDocument();
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.adminOutstanding() }),
    );
  });

  it("deletes a note", async () => {
    const user = userEvent.setup();
    fetchOutstanding.mockResolvedValue({ members: { u1: { items: [], openNotes: 1 } } });
    fetchNotes.mockResolvedValueOnce([note()]);
    deleteNote.mockResolvedValue();
    renderSection(0);
    await user.click(await screen.findByRole("button", { name: "Delete note: Bring back Brass" }));
    expect(deleteNote).toHaveBeenCalledWith("u1", 1);
    await waitFor(() => expect(screen.queryByText("Bring back Brass")).not.toBeInTheDocument());
  });
});
