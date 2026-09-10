import type { AdminArrivalPoll, AdminUser } from "@boardgames/core/protocol";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveGame } from "../../lib/games-by-slug";
import { type DraftGame, firstUnmetRequirement, isDraftValid, newDraftGame } from "./arrival-draft";

// The composer's gates are the whole point: Publish only lights up when every
// picked game has an owner and a prepared photo, the footer names the next
// missing thing, and the request body is exactly what the server expects.

const publishMock = vi.fn();
vi.mock("../../lib/arrivals.ts", () => ({
  fetchAdminArrivals: vi.fn(),
  publishArrival: (body: unknown) => publishMock(body),
  retractArrival: vi.fn(),
}));

// jsdom has no canvas: the downscale is the one seam mocked away.
const photoMock = vi.fn();
vi.mock("../../lib/downscale-image", () => ({
  fileToArrivalPhoto: (file: File) => photoMock(file),
}));

import { dateKey } from "../../lib/offline-availability";
import { ArrivalComposerModal } from "./ArrivalComposerModal";

const title = (slug: string) => resolveGame(slug)?.title ?? slug;
const WINGSPAN = title("wingspan");
const PARKS = title("parks");
const ARCS = title("arcs");
const SPIRIT = title("spirit-island");

const POLL: AdminArrivalPoll = {
  id: 3,
  createdAt: "2026-09-01 10:00:00",
  closedAt: "2026-09-03 16:00:00",
  winnerSlug: "wingspan",
  candidates: ["wingspan", "parks", "arcs", "spirit-island"],
  voterCount: 3,
  tally: [
    { slug: "wingspan", votes: 3, voterIds: ["u1", "u2", "u3"] },
    { slug: "parks", votes: 2, voterIds: ["u2", "u3"] },
    { slug: "arcs", votes: 1, voterIds: ["u1"] },
    { slug: "spirit-island", votes: 0, voterIds: [] },
  ],
  arrivedSlugs: ["arcs"],
};

const PLAYERS = {
  u1: { name: "Mantas", image: null },
  u2: { name: "Paul", image: null },
  u3: { name: "Juliane", image: null },
};

const MEMBERS: AdminUser[] = [
  { id: "u1", name: "Mantas", email: "m@x", createdAt: "2026-01-01" },
  { id: "u2", name: "Paul", email: "p@x", createdAt: "2026-01-01" },
];

const PORTRAIT = { dataUri: "data:image/jpeg;base64,x", width: 800, height: 1000, bytes: 1200 };
const LANDSCAPE = { dataUri: "data:image/jpeg;base64,y", width: 1000, height: 800, bytes: 1300 };

function renderModal(overrides: Partial<Parameters<typeof ArrivalComposerModal>[0]> = {}) {
  const onClose = vi.fn();
  const onPublished = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ArrivalComposerModal
        polls={[POLL]}
        players={PLAYERS}
        members={MEMBERS}
        viewerId="u1"
        onClose={onClose}
        onPublished={onPublished}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { onClose, onPublished };
}

const footer = () => screen.getByTestId("arrival-draft-status");
const publishButton = () => screen.getByRole("button", { name: "Publish" });
const photoInput = (game: string) => screen.getByLabelText(`Photo of ${game}`);
const jpeg = () => new File(["x"], "box.jpg", { type: "image/jpeg" });

beforeEach(() => {
  publishMock.mockReset();
  publishMock.mockResolvedValue({ ok: true, arrivalId: "a1" });
  photoMock.mockReset();
  photoMock.mockResolvedValue(PORTRAIT);
});

describe("ArrivalComposerModal — gates", () => {
  it("preselects the winner and asks for its owner first", () => {
    renderModal();
    expect(screen.getByRole("checkbox", { name: WINGSPAN })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: PARKS })).not.toBeChecked();
    expect(publishButton()).toBeDisabled();
    expect(footer()).toHaveTextContent(`Pick who bought ${WINGSPAN}`);
  });

  it("then asks for the photo, and enables Publish once it is prepared", async () => {
    renderModal();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Mantas" }));
    expect(footer()).toHaveTextContent(`Add a photo of ${WINGSPAN}`);
    expect(publishButton()).toBeDisabled();

    await user.upload(photoInput(WINGSPAN), jpeg());
    await waitFor(() => expect(publishButton()).toBeEnabled());
    expect(footer()).toHaveTextContent("Ready — 1 game, 1 owner");
    expect(screen.getByText("800×1000 · 1 KB")).toBeInTheDocument();
    expect(screen.queryByText(/This photo is landscape/)).toBeNull();
  });

  it("warns when the photo is landscape", async () => {
    photoMock.mockResolvedValue(LANDSCAPE);
    renderModal();
    const user = userEvent.setup();

    await user.upload(photoInput(WINGSPAN), jpeg());
    expect(await screen.findByText(/This photo is landscape/)).toBeInTheDocument();
  });

  it("surfaces a failed downscale on the field and keeps Publish off", async () => {
    photoMock.mockRejectedValue(new Error("Choose a PNG, JPEG or WebP photo."));
    renderModal();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Mantas" }));
    await user.upload(photoInput(WINGSPAN), jpeg());
    expect(await screen.findByText("Choose a PNG, JPEG or WebP photo.")).toBeInTheDocument();
    expect(publishButton()).toBeDisabled();
  });

  it("caps the pick at three games and marks the rest as unavailable", async () => {
    renderModal();
    const user = userEvent.setup();

    await user.click(screen.getByRole("checkbox", { name: PARKS }));
    await user.click(screen.getByRole("checkbox", { name: new RegExp(`^${ARCS}`) }));
    const fourth = screen.getByRole("checkbox", {
      name: `${SPIRIT} — up to 3 games per announcement`,
    });
    expect(fourth).toBeDisabled();
  });

  it("prefills later picks with the last chosen owner", async () => {
    renderModal();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Paul" }));
    await user.click(screen.getByRole("checkbox", { name: PARKS }));
    // Two collapsed owner rows, both Paul — each with its own Change button.
    expect(screen.getAllByRole("button", { name: "Change" })).toHaveLength(2);
    expect(footer()).toHaveTextContent(`Add a photo of ${WINGSPAN}`);
  });

  it("publishes exactly the wire body and reports the new arrival", async () => {
    renderModal();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Mantas" }));
    await user.upload(photoInput(WINGSPAN), jpeg());
    await waitFor(() => expect(publishButton()).toBeEnabled());
    await user.click(publishButton());

    await waitFor(() =>
      expect(publishMock).toHaveBeenCalledWith({
        pollId: 3,
        acquiredOn: dateKey(new Date()),
        games: [{ slug: "wingspan", purchaserUserId: "u1", photo: "data:image/jpeg;base64,x" }],
      }),
    );
  });

  it("lets the arrival be backdated, and holds Publish while the date is blank", async () => {
    renderModal();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Mantas" }));
    await user.upload(photoInput(WINGSPAN), jpeg());
    await waitFor(() => expect(publishButton()).toBeEnabled());

    const date = screen.getByLabelText("Arrived on");
    fireEvent.change(date, { target: { value: "" } });
    expect(publishButton()).toBeDisabled();
    expect(footer()).toHaveTextContent("Pick the arrival date");

    fireEvent.change(date, { target: { value: "2026-09-06" } });
    await waitFor(() => expect(publishButton()).toBeEnabled());
    await user.click(publishButton());

    await waitFor(() =>
      expect(publishMock).toHaveBeenCalledWith(
        expect.objectContaining({ acquiredOn: "2026-09-06" }),
      ),
    );
  });

  it("swaps itself for the real takeover as a preview, and comes back", async () => {
    renderModal();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Mantas" }));
    await user.upload(photoInput(WINGSPAN), jpeg());
    await waitFor(() => expect(publishButton()).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Preview popup" }));

    expect(await screen.findByText("Admin preview — nothing is sent")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Later" }));
    expect(await screen.findByRole("button", { name: "Publish" })).toBeInTheDocument();
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("marks candidates already announced and the winner", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Announced")).toBeInTheDocument();
    expect(within(dialog).getByText("Winner")).toBeInTheDocument();
  });
});

describe("draft rules", () => {
  const t = (slug: string) => slug;
  const ready = (slug: string, owner = "u1"): DraftGame => ({
    ...newDraftGame(slug, owner),
    photo: { ...PORTRAIT, landscape: false, fileName: "a.jpg" },
  });

  it("names the first missing thing in reading order", () => {
    expect(firstUnmetRequirement([], t)).toBe("Pick 1–3 games");
    expect(firstUnmetRequirement([newDraftGame("a", null)], t)).toBe("Pick who bought a");
    expect(firstUnmetRequirement([newDraftGame("a", "u1")], t)).toBe("Add a photo of a");
    expect(
      firstUnmetRequirement([{ ...newDraftGame("a", "u1"), photoStatus: "processing" }], t),
    ).toBe("Preparing a's photo…");
    expect(firstUnmetRequirement([ready("a"), newDraftGame("b", null)], t)).toBe(
      "Pick who bought b",
    );
    expect(firstUnmetRequirement([ready("a"), ready("b"), ready("c"), ready("d")], t)).toBe(
      "Pick at most 3 games",
    );
  });

  it("is valid only when every picked game has an owner and a photo", () => {
    expect(isDraftValid([ready("a")])).toBe(true);
    expect(isDraftValid([ready("a"), ready("b", "u2"), ready("c")])).toBe(true);
    expect(isDraftValid([ready("a"), newDraftGame("b", "u1")])).toBe(false);
    expect(isDraftValid([])).toBe(false);
  });
});
