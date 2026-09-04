import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The upload path exists because generation runs on a PAID image model and can
// be unavailable while the rest of the app is fine. These tests pin that a
// picture made elsewhere reaches the same save call a generated one does —
// without ever starting a job.
//
// Both mocks are module-level: the canvas/webp conversion needs a real browser
// (jsdom has no `createImageBitmap`), and `saveAvatar` is the assertion target.
const fileToAvatarDataUriMock = vi.fn();
vi.mock("../../lib/downscale-image.ts", () => ({
  fileToAvatarDataUri: (file: File) => fileToAvatarDataUriMock(file),
  fileToDownscaledDataUri: vi.fn().mockResolvedValue("data:image/webp;base64,reference"),
}));

// The upload path is ADMIN-ONLY: members have no prompt and no reason to know
// avatars are pipelined, so a bare file picker would just erode the house
// style. Tests drive this flag directly.
let isAdmin = true;
vi.mock("../../hooks/useCurrentUser.ts", () => ({
  useCurrentUser: () => ({ user: { id: "u1" }, isAdmin }),
}));

const saveAvatarMock = vi.fn();
const generateAvatarMock = vi.fn();
vi.mock("../../lib/profile.ts", () => ({
  saveAvatar: (userId: string, image: string) => saveAvatarMock(userId, image),
  generateAvatar: (...args: unknown[]) => generateAvatarMock(...args),
  fetchAvatarJob: vi.fn(),
}));

import { GenerateAvatarModal } from "./GenerateAvatarModal";

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <GenerateAvatarModal userId="u1" onClose={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // Call history leaks across tests otherwise, and the "must not save" and
  // "must not generate" assertions are the point of two of them.
  isAdmin = true;
  fileToAvatarDataUriMock.mockReset();
  saveAvatarMock.mockReset();
  generateAvatarMock.mockReset();
});

function pngFile() {
  return new File(["x"], "avatar.png", { type: "image/png" });
}

describe("GenerateAvatarModal — upload a finished picture", () => {
  it("converts the file and saves it without starting a generation job", async () => {
    fileToAvatarDataUriMock.mockResolvedValue("data:image/webp;base64,finished");
    saveAvatarMock.mockResolvedValue({ ok: true, image: "data:image/webp;base64,finished" });
    renderModal();

    const input = screen.getByLabelText(/upload a finished profile picture/i, {
      selector: "input",
    });
    await userEvent.upload(input, pngFile());

    // Lands in the shared preview, not a job.
    const preview = await screen.findByAltText(/generated avatar preview/i);
    expect(preview).toHaveAttribute("src", "data:image/webp;base64,finished");
    expect(generateAvatarMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /use this photo/i }));
    await waitFor(() =>
      expect(saveAvatarMock).toHaveBeenCalledWith("u1", "data:image/webp;base64,finished"),
    );
  });

  // The secondary button means different things per source; an uploaded
  // picture has nothing to "regenerate".
  it("offers 'Choose another' rather than 'Regenerate' for an upload", async () => {
    fileToAvatarDataUriMock.mockResolvedValue("data:image/webp;base64,finished");
    renderModal();

    await userEvent.upload(
      screen.getByLabelText(/upload a finished profile picture/i, { selector: "input" }),
      pngFile(),
    );

    expect(await screen.findByRole("button", { name: /choose another/i })).toBeVisible();
    expect(screen.queryByRole("button", { name: /regenerate/i })).toBeNull();
  });

  it("is hidden from non-admin members entirely", () => {
    isAdmin = false;
    renderModal();
    expect(screen.queryByText(/upload a finished profile picture/i)).toBeNull();
    // The generator itself stays available to everyone. (Presence, not
    // visibility: the button renders disabled until a photo + game are picked,
    // which is orthogonal to the admin gate under test.)
    expect(screen.getByRole("button", { name: /^generate$/i })).toBeTruthy();
  });

  // A browser with no webp canvas support silently yields PNG, which the save
  // schema rejects — the helper throws and the user must see why.
  it("surfaces a conversion failure instead of a dead click", async () => {
    fileToAvatarDataUriMock.mockRejectedValue(new Error("This browser can't produce webp images"));
    renderModal();

    await userEvent.upload(
      screen.getByLabelText(/upload a finished profile picture/i, { selector: "input" }),
      pngFile(),
    );

    expect(await screen.findByText(/can't produce webp images/i)).toBeVisible();
    expect(saveAvatarMock).not.toHaveBeenCalled();
  });
});
