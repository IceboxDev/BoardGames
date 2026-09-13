import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SensoCard, { SensoCardBack } from "./SensoCard";

describe("SensoCard", () => {
  it("is an image named by its spoken label", () => {
    render(<SensoCard card="takeda-13" size="hand" />);
    expect(screen.getByRole("img", { name: "King of Takeda" })).toBeInTheDocument();
  });

  it("takes a label override and names clan-only cards by the clan", () => {
    render(<SensoCard card="oda-7" ariaLabel="7 of Oda, played 2nd by Aydan" />);
    expect(screen.getByRole("img", { name: /played 2nd/ })).toBeInTheDocument();
    render(<SensoCard card="mori-14" clanOnly />);
    expect(screen.getByRole("img", { name: "Mōri clan" })).toBeInTheDocument();
  });

  it("becomes a pressable button when clickable, inert when disabled", () => {
    const onClick = vi.fn();
    render(<SensoCard card="uesugi-2" onClick={onClick} selected />);
    const button = screen.getByRole("button", { name: "2 of Uesugi" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    button.click();
    expect(onClick).toHaveBeenCalledOnce();
    render(<SensoCard card="uesugi-3" onClick={onClick} disabled />);
    screen.getByRole("button", { name: "3 of Uesugi" }).click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("lets a caller's width beat the size's width", () => {
    render(<SensoCard card="takeda-14" size="mini" clanOnly className="w-full" />);
    const el = screen.getByRole("img", { name: "Takeda clan" });
    expect(el.className).toContain("w-full");
    expect(el.className).not.toContain("w-9");
  });

  it("marks only the advantage suit", () => {
    const { container } = render(<SensoCard card="takeda-5" trump="takeda" />);
    expect(container.querySelector('[data-layer="seal"]')).not.toBeNull();
    const { container: other } = render(<SensoCard card="oda-5" trump="takeda" />);
    expect(other.querySelector('[data-layer="seal"]')).toBeNull();
  });

  it("the back is hidden from assistive tech and carries the emblem", () => {
    const { container } = render(<SensoCardBack size="mini" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden");
    expect(container.querySelector('[data-layer="emblem"]')).not.toBeNull();
  });
});
