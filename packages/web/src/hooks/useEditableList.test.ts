import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useEditableList } from "./useEditableList";

describe("useEditableList — initialization", () => {
  it("starts with draft=null and isReady=false until data loads", () => {
    const { result } = renderHook(({ loaded }) => useEditableList<string>(loaded), {
      initialProps: { loaded: undefined as string[] | undefined },
    });
    expect(result.current.draft).toBeNull();
    expect(result.current.isReady).toBe(false);
    expect(result.current.committed).toEqual([]);
    expect(result.current.isDirty).toBe(false);
  });

  it("seeds draft from the loaded array on first render", () => {
    const { result } = renderHook(() => useEditableList<string>(["a", "b"]));
    expect(result.current.draft).toEqual(["a", "b"]);
    expect(result.current.isReady).toBe(true);
    expect(result.current.committed).toEqual(["a", "b"]);
    expect(result.current.isDirty).toBe(false);
  });

  it("seeds draft from an empty array (distinct from `undefined`)", () => {
    const { result } = renderHook(() => useEditableList<string>([]));
    expect(result.current.draft).toEqual([]);
    expect(result.current.isReady).toBe(true);
  });

  it("re-syncs the draft when the loaded array changes (e.g. after a refetch)", () => {
    const { result, rerender } = renderHook(({ loaded }) => useEditableList<string>(loaded), {
      initialProps: { loaded: ["a"] as string[] | undefined },
    });
    expect(result.current.draft).toEqual(["a"]);
    rerender({ loaded: ["a", "b"] });
    expect(result.current.draft).toEqual(["a", "b"]);
  });
});

describe("useEditableList — toggle", () => {
  it("adds an item that isn't already in the draft", () => {
    const { result } = renderHook(() => useEditableList<string>(["a"]));
    act(() => result.current.toggle("b"));
    expect(result.current.draft).toEqual(["a", "b"]);
  });

  it("removes an item that is in the draft", () => {
    const { result } = renderHook(() => useEditableList<string>(["a", "b"]));
    act(() => result.current.toggle("a"));
    expect(result.current.draft).toEqual(["b"]);
  });

  it("preserves order of existing items when removing one", () => {
    const { result } = renderHook(() => useEditableList<string>(["a", "b", "c"]));
    act(() => result.current.toggle("b"));
    expect(result.current.draft).toEqual(["a", "c"]);
  });

  it("appends new items in toggle order", () => {
    const { result } = renderHook(() => useEditableList<string>(["a"]));
    act(() => result.current.toggle("b"));
    act(() => result.current.toggle("c"));
    expect(result.current.draft).toEqual(["a", "b", "c"]);
  });

  it("is a no-op when the draft has not been initialized yet", () => {
    const { result } = renderHook(() => useEditableList<string>(undefined));
    act(() => result.current.toggle("a"));
    expect(result.current.draft).toBeNull();
  });
});

describe("useEditableList — replace + reset", () => {
  it("replace() overwrites the draft wholesale (Clear queue case)", () => {
    const { result } = renderHook(() => useEditableList<string>(["a", "b"]));
    act(() => result.current.replace([]));
    expect(result.current.draft).toEqual([]);
    expect(result.current.isDirty).toBe(true);
  });

  it("reset() reverts the draft to committed", () => {
    const { result } = renderHook(() => useEditableList<string>(["a", "b"]));
    act(() => result.current.toggle("c"));
    expect(result.current.draft).toEqual(["a", "b", "c"]);
    act(() => result.current.reset());
    expect(result.current.draft).toEqual(["a", "b"]);
    expect(result.current.isDirty).toBe(false);
  });
});

describe("useEditableList — isDirty", () => {
  it("is false immediately after load", () => {
    const { result } = renderHook(() => useEditableList<string>(["a", "b"]));
    expect(result.current.isDirty).toBe(false);
  });

  it("flips to true after adding an item", () => {
    const { result } = renderHook(() => useEditableList<string>(["a"]));
    act(() => result.current.toggle("b"));
    expect(result.current.isDirty).toBe(true);
  });

  it("flips to true after removing an item", () => {
    const { result } = renderHook(() => useEditableList<string>(["a", "b"]));
    act(() => result.current.toggle("a"));
    expect(result.current.isDirty).toBe(true);
  });

  it("flips back to false when edits are exactly undone (order-independent membership)", () => {
    const { result } = renderHook(() => useEditableList<string>(["a", "b"]));
    act(() => result.current.toggle("c"));
    act(() => result.current.toggle("c"));
    expect(result.current.draft).toEqual(["a", "b"]);
    expect(result.current.isDirty).toBe(false);
  });

  it("ignores element order — same-membership lists are not dirty", () => {
    const { result } = renderHook(() => useEditableList<string>(["a", "b"]));
    act(() => result.current.replace(["b", "a"]));
    expect(result.current.isDirty).toBe(false);
  });
});
