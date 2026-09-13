import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CardBack from "./CardBack";

vi.mock("./card-art", async (importOriginal) => {
  const real = await importOriginal<typeof import("./card-art")>();
  return { ...real, cardArtUrl: vi.fn(() => undefined) };
});

const art = await import("./card-art");
const cardArtUrl = art.cardArtUrl as unknown as ReturnType<typeof vi.fn>;

describe("CardBack", () => {
  it("draws the ringed 戦 until the emblem exists", () => {
    const { container } = render(<CardBack size="hand" />);
    expect(container.querySelector('[data-fallback="back-emblem"]')?.textContent).toBe("戦");
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("uses the emblem and the pattern once they exist, but no pattern at mini", () => {
    cardArtUrl.mockImplementation((name: string) => `/${name}.webp`);
    const { container } = render(<CardBack size="hand" />);
    expect(container.querySelector('img[data-layer="emblem"]')).not.toBeNull();
    expect(container.querySelector('[data-layer="back-pattern"]')).not.toBeNull();
    const { container: mini } = render(<CardBack size="mini" />);
    expect(mini.querySelector('[data-layer="back-pattern"]')).toBeNull();
    cardArtUrl.mockReset();
  });
});
