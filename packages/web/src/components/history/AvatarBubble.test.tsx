import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AvatarBubble } from "./AvatarBubble";

describe("AvatarBubble", () => {
  it("names a crossed-out player's mark for screen readers", () => {
    render(<AvatarBubble name="Juliane Franzen" crossed="voted out" />);
    expect(screen.getByRole("img", { name: "Juliane Franzen, voted out" })).toBeTruthy();
  });

  it("reads a plain bubble as just the name", () => {
    render(<AvatarBubble name="Juliane Franzen" isMe />);
    expect(screen.getByRole("img", { name: "Juliane Franzen (you)" })).toBeTruthy();
  });
});
