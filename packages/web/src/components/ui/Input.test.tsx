import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Input } from "./Input";

describe("Input", () => {
  it("renders a text input with the given value", () => {
    render(<Input value="hello" onChange={() => {}} placeholder="Name" />);
    const input = screen.getByPlaceholderText("Name") as HTMLInputElement;
    expect(input.value).toBe("hello");
  });

  it("invalid=true applies the rose border class set", () => {
    render(<Input invalid value="" onChange={() => {}} placeholder="x" />);
    expect(screen.getByPlaceholderText("x").className).toMatch(/border-rose-500/);
  });

  it("invalid=false uses the neutral border class set", () => {
    render(<Input value="" onChange={() => {}} placeholder="x" />);
    expect(screen.getByPlaceholderText("x").className).not.toMatch(/border-rose-500/);
  });

  it("forwards typing through onChange", async () => {
    const onChange = vi.fn();
    render(<Input value="" onChange={onChange} placeholder="x" />);
    await userEvent.type(screen.getByPlaceholderText("x"), "ab");
    expect(onChange).toHaveBeenCalled();
  });

  it("forwards extra HTML attributes (autoComplete, disabled)", () => {
    render(<Input value="" onChange={() => {}} disabled autoComplete="off" placeholder="x" />);
    const input = screen.getByPlaceholderText("x");
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute("autocomplete", "off");
  });
});
