import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { testQueryClient } from "../../../test/query-client";
import CompanionScreen from "./CompanionScreen";

// The photo → the words → a tap covers one. The canvas downscale needs a real
// browser, and the scan is the server's: both are stubbed.

const apiFetch = vi.fn();
vi.mock("../../../lib/api-fetch", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));
vi.mock("../../../lib/downscale-image", () => ({
  downscaleImageFile: vi.fn().mockResolvedValue({
    dataUri: "data:image/jpeg;base64,/9j/4AAQ",
    width: 2048,
    height: 1536,
    bytes: 12,
  }),
}));

const WORDS = Array.from({ length: 25 }, (_, i) => (i === 0 ? "BÄR" : `WORD${i}`));

afterEach(() => {
  apiFetch.mockReset();
  localStorage.clear();
});

function renderScreen() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <MemoryRouter>
        <CompanionScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Codenames Companion", () => {
  it("reads a photo into the grid, and a tap then Red covers a word", async () => {
    apiFetch.mockResolvedValue({
      language: "de",
      cells: WORDS.map((word, i) => ({ word, sure: i !== 1, cover: null })),
    });
    const { container } = renderScreen();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "grid.jpg")] } });

    const bear = await screen.findByRole("button", { name: "BÄR" });
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/games/codenames/scan",
      expect.objectContaining({ body: { image: "data:image/jpeg;base64,/9j/4AAQ" } }),
    );
    expect(screen.getByText(/1 word may be misread/)).toBeInTheDocument();

    fireEvent.click(bear);
    const bar = screen.getByTestId("game-action-bar");
    fireEvent.click(within(bar).getByRole("button", { name: "Red" }));
    expect(screen.getByRole("button", { name: /^BÄR: / })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("codenames-companion:v1") ?? "{}").covers[0]).toBe(
      "red",
    );
  });

  it("says why a photo couldn't be read", async () => {
    apiFetch.mockRejectedValue(new Error("That's a cat, not a grid"));
    const { container } = renderScreen();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "cat.jpg")] } });
    expect(await screen.findByText("That's a cat, not a grid")).toBeInTheDocument();
  });
});
