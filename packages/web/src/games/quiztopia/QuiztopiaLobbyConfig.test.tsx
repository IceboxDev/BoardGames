import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import QuiztopiaLobbyConfig, {
  previewLit,
  readLobbyValue,
  withLanguage,
} from "./QuiztopiaLobbyConfig";

const VALUE = { difficulty: 2, expert: true, deck: "original", language: "en" } as const;

describe("QuiztopiaLobbyConfig", () => {
  it("switches Expert off and explains the solo rules at one player", () => {
    render(<QuiztopiaLobbyConfig value={VALUE} onChange={vi.fn()} isHost playerCount={1} />);
    expect(screen.getByRole("tab", { name: "Expert" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Standard" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Solo rules")).toBeInTheDocument();
    expect(screen.getByText(/3 of 12 start dark for 1 player/)).toBeInTheDocument();
  });

  it("reads the tier facts off the constants for the live line", () => {
    render(<QuiztopiaLobbyConfig value={VALUE} onChange={vi.fn()} isHost playerCount={3} />);
    expect(screen.getByText(/Win at/)).toHaveTextContent(
      "Win at 10 buildings · lost at 3 lost · Expert tips 2",
    );
    expect(screen.getByRole("tab", { name: "Expert" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/5 of 12 start dark for 3 players/)).toBeInTheDocument();
  });

  it("emits the wire shape on every change", () => {
    const onChange = vi.fn();
    render(<QuiztopiaLobbyConfig value={VALUE} onChange={onChange} isHost playerCount={3} />);
    fireEvent.click(screen.getByRole("tab", { name: "Hölle ×3" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...VALUE, difficulty: 3 });
    fireEvent.click(screen.getByRole("tab", { name: "Standard" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...VALUE, expert: false });
    fireEvent.click(screen.getByRole("tab", { name: "Both" }));
    const { language: _drop, ...rest } = VALUE;
    expect(onChange).toHaveBeenLastCalledWith(rest);
  });

  it("is read-only for guests", () => {
    render(
      <QuiztopiaLobbyConfig value={VALUE} onChange={vi.fn()} isHost={false} playerCount={2} />,
    );
    expect(screen.getByText("Host is setting the table")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Normal" })).toBeDisabled();
  });

  it("normalises a garbage value and builds the preview", () => {
    expect(readLobbyValue({ difficulty: 9, deck: "weird", language: "fr" })).toEqual({
      difficulty: 0,
      expert: false,
      deck: "original",
      language: undefined,
    });
    expect(withLanguage(readLobbyValue(null), "de").language).toBe("de");
    expect(previewLit(3).filter((lit) => !lit)).toHaveLength(5);
    expect(previewLit(6).filter((lit) => !lit)).toHaveLength(8);
  });
});
