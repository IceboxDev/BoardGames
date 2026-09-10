import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./Avatar";

describe("Avatar", () => {
  it("falls back to initials by default", () => {
    render(<Avatar name="Ada Lovelace" />);
    expect(screen.getByRole("img", { name: "Ada Lovelace" })).toHaveTextContent("AL");
  });

  it("renders the image when one is given", () => {
    render(<Avatar name="Ada Lovelace" image="data:image/webp;base64,UklGRiIAAABXRUJQVlA4" />);
    expect(screen.getByRole("img", { name: "Ada Lovelace" }).tagName).toBe("IMG");
  });

  it("silhouette fallback shows a figure, never initials, and stays labelled", () => {
    render(<Avatar name="" fallback="silhouette" accentHex="#d36830" />);
    const el = screen.getByRole("img", { name: "Player" });
    expect(el).toHaveAttribute("data-fallback", "silhouette");
    expect(el.textContent).toBe("");
    expect(el.querySelector("svg")).not.toBeNull();
  });

  it("silhouette keeps the given name as its label when one is provided", () => {
    render(<Avatar name="Ada Lovelace" fallback="silhouette" />);
    const el = screen.getByRole("img", { name: "Ada Lovelace" });
    expect(el.textContent).toBe("");
  });
});
