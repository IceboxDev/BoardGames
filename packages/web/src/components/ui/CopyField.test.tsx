import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CopyField } from "./CopyField";

describe("CopyField", () => {
  it("shows the value in a labelled read-only field", () => {
    render(<CopyField value="https://example.test/x" ariaLabel="Reset link" />);
    const input = screen.getByRole("textbox", { name: "Reset link" });
    expect(input).toHaveValue("https://example.test/x");
    expect(input).toHaveAttribute("readonly");
  });

  it("copies the value and flips the button label to Copied", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CopyField value="secret-token" ariaLabel="Token" mono />);

    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("secret-token");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("keeps the Copy label when the clipboard write is blocked", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("nope")) },
    });
    render(<CopyField value="v" ariaLabel="Token" />);
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });
});
