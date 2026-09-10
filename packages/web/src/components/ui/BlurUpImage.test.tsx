import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BlurUpImage } from "./BlurUpImage";

const PLACEHOLDER = "data:image/webp;base64,UklGRiIAAABXRUJQVlA4";

describe("BlurUpImage", () => {
  it("paints the blurred placeholder underneath and hides it from assistive tech", () => {
    render(
      <BlurUpImage
        src="/api/arrivals/a1/photos/arcs"
        placeholder={PLACEHOLDER}
        width={1280}
        height={1600}
        alt="Arcs box"
      />,
    );
    const stub = document.querySelector('img[aria-hidden="true"]');
    expect(stub).toHaveAttribute("src", PLACEHOLDER);
    expect(stub?.className).toContain("blur-xl");
  });

  it("keeps the real photo invisible until it loads, then fades it in", () => {
    render(
      <BlurUpImage
        src="/api/arrivals/a1/photos/arcs"
        placeholder={PLACEHOLDER}
        width={1280}
        height={1600}
        alt="Arcs box"
      />,
    );
    const img = screen.getByRole("img", { name: "Arcs box" });
    expect(img).toHaveAttribute("width", "1280");
    expect(img).toHaveAttribute("height", "1600");
    expect(img.className).toContain("opacity-0");
    fireEvent.load(img);
    expect(img.className).toContain("opacity-100");
    expect(img).toHaveAttribute("data-loaded", "true");
  });

  it("reveals on error too, so a failed photo shows the tint and not a broken glyph", () => {
    render(
      <BlurUpImage
        src="/api/arrivals/a1/photos/missing"
        placeholder={PLACEHOLDER}
        width={4}
        height={5}
        alt="Missing box"
      />,
    );
    const img = screen.getByRole("img", { name: "Missing box" });
    fireEvent.error(img);
    expect(img.className).toContain("opacity-100");
  });

  it("marks the hero photo as high priority", () => {
    render(
      <BlurUpImage src="/x" placeholder={PLACEHOLDER} width={4} height={5} alt="Hero" priority />,
    );
    const img = screen.getByRole("img", { name: "Hero" });
    expect(img).toHaveAttribute("loading", "eager");
    expect(img).toHaveAttribute("fetchpriority", "high");
  });
});
