import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { useSoloGameHistory } from "./useSoloGameHistory";

function setup(enabled = true) {
  const leaveGame = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={["/play/connect-4", "/play/connect-4/solo"]} initialIndex={1}>
      {children}
    </MemoryRouter>
  );
  const hook = renderHook(
    () => ({
      history: useSoloGameHistory(enabled, leaveGame),
      location: useLocation(),
      navigate: useNavigate(),
    }),
    { wrapper },
  );
  return { hook, leaveGame };
}

describe("useSoloGameHistory", () => {
  it("puts the game one entry above its setup screen, on the same URL", () => {
    const { hook, leaveGame } = setup();
    act(() => hook.result.current.history.enterGame());
    expect(hook.result.current.location.pathname).toBe("/play/connect-4/solo");
    expect(hook.result.current.location.state).toEqual({ soloGame: true });
    expect(leaveGame).not.toHaveBeenCalled();
  });

  it("returns to the setup screen on Back, not to the game's menu", () => {
    const { hook, leaveGame } = setup();
    act(() => hook.result.current.history.enterGame());
    act(() => hook.result.current.navigate(-1));
    expect(hook.result.current.location.pathname).toBe("/play/connect-4/solo");
    expect(leaveGame).toHaveBeenCalledOnce();
  });

  it("pops the game's entry on Change Setup", () => {
    const { hook, leaveGame } = setup();
    act(() => hook.result.current.history.enterGame());
    act(() => hook.result.current.history.exitGame());
    expect(hook.result.current.location.state).toBeNull();
    expect(leaveGame).toHaveBeenCalledOnce();
    // Back from the setup screen now leaves for the menu, as it should.
    act(() => hook.result.current.navigate(-1));
    expect(hook.result.current.location.pathname).toBe("/play/connect-4");
  });

  it("leaves a game without its entry alone, and does nothing in rooms", () => {
    const { hook, leaveGame } = setup(false);
    act(() => hook.result.current.history.enterGame());
    expect(hook.result.current.location.state).toBeNull();
    act(() => hook.result.current.history.exitGame());
    expect(leaveGame).toHaveBeenCalledOnce(); // no entry to pop: just back to setup
  });
});
