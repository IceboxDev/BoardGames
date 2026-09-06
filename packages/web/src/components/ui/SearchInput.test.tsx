import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchInput } from "./SearchInput";

describe("SearchInput", () => {
  it("renders a search-role input carrying the leading-icon padding", async () => {
    const onChange = vi.fn();
    render(<SearchInput aria-label="Search games" placeholder="Search…" onChange={onChange} />);
    const box = screen.getByRole("searchbox", { name: "Search games" });
    expect(box.className).toContain("pl-8");
    await userEvent.type(box, "ab");
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("sizes from the outside through containerClassName", () => {
    const { container } = render(
      <SearchInput aria-label="s" containerClassName="w-full sm:w-64" className="h-9" />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("relative");
    expect(wrapper.className).toContain("sm:w-64");
    expect(screen.getByRole("searchbox").className).toContain("h-9");
  });
});
