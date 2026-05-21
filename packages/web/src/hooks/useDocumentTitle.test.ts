import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import useDocumentTitle from "./useDocumentTitle";

describe("useDocumentTitle", () => {
  const originalTitle = document.title;
  afterEach(() => {
    document.title = originalTitle;
  });

  it("sets document.title on mount", () => {
    renderHook(() => useDocumentTitle("My Game · BoardGames"));
    expect(document.title).toBe("My Game · BoardGames");
  });

  it("updates on every title change", () => {
    const { rerender } = renderHook(({ title }) => useDocumentTitle(title), {
      initialProps: { title: "A" },
    });
    expect(document.title).toBe("A");
    rerender({ title: "B" });
    expect(document.title).toBe("B");
  });

  it("restores the previous title on unmount", () => {
    document.title = "Before";
    const { unmount } = renderHook(() => useDocumentTitle("Inside"));
    expect(document.title).toBe("Inside");
    unmount();
    expect(document.title).toBe("Before");
  });
});
