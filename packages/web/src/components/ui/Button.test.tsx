import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button — rendering", () => {
  it("renders children as the button label", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("defaults to type=button so it never accidentally submits a parent form", () => {
    render(<Button>Click</Button>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });

  it("respects an explicit type=submit", () => {
    render(<Button type="submit">Save</Button>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("submit");
  });

  it("does not submit a parent form on click (action button in a form)", async () => {
    const onSubmit = vi.fn((e: FormEvent) => e.preventDefault());
    const onClick = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <Button onClick={onClick}>Remove</Button>
      </form>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("applies the primary gradient by default", () => {
    render(<Button>X</Button>);
    expect(screen.getByRole("button").className).toMatch(/bg-gradient-to-r/);
  });

  it.each([
    ["secondary", /bg-surface-800/],
    ["ghost", /text-gray-300/],
    ["danger", /bg-rose-500/],
    ["warning", /bg-amber-500/],
    ["link", /text-gray-500/],
  ] as const)("variant=%s applies its class signature", (variant, signature) => {
    render(<Button variant={variant}>X</Button>);
    expect(screen.getByRole("button").className).toMatch(signature);
  });

  it.each(["xs", "sm", "md", "lg"] as const)("size=%s applies a size class", (size) => {
    render(<Button size={size}>X</Button>);
    expect(screen.getByRole("button").className).toMatch(/px-\d+/);
  });

  it("link variant drops the size padding so it sits inline", () => {
    render(
      <Button variant="link" size="md">
        Link
      </Button>,
    );
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/text-xs/);
    expect(btn.className).not.toMatch(/px-4/);
  });

  it("shape=pill is rounded-full; rounded is rounded-lg", () => {
    const { rerender } = render(
      <Button shape="rounded" key="a">
        X
      </Button>,
    );
    expect(screen.getByRole("button").className).toMatch(/rounded-lg/);
    rerender(
      <Button shape="pill" key="b">
        X
      </Button>,
    );
    expect(screen.getByRole("button").className).toMatch(/rounded-full/);
  });

  it("block=true stretches with w-full", () => {
    render(<Button block>X</Button>);
    expect(screen.getByRole("button").className).toMatch(/w-full/);
  });
});

describe("Button — interaction", () => {
  it("fires onClick on click", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>X</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        X
      </Button>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("loading state disables the button and swaps children for ellipsis", () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn.textContent).toBe("…");
  });
});
