import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AdminUser } from "./types";
import { UserRow } from "./UserRow";

// InventoryPanel pulls in react-query and would otherwise hit the API on
// every row that opens its inventory; stub it out so this test focuses on
// the row's own behavior (online toggle / delete gating).
vi.mock("./InventoryPanel", () => ({
  InventoryPanel: ({ userId }: { userId: string }) => <div data-testid={`inv-${userId}`}>inv</div>,
}));

function user(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: "u1",
    name: "Lina Smith",
    email: "lina@example.com",
    role: "user",
    onlineMode: "offline",
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function defaultProps() {
  return {
    user: user(),
    coverage: { can: 3, maybe: 1, total: 10 },
    expanded: false,
    onToggleInventory: vi.fn(),
    onSetOnlineMode: vi.fn(),
    pending: false,
    onOpenCalendar: vi.fn(),
    deleteMode: false,
    isSelf: false,
    confirmingDelete: false,
    confirmEmail: "",
    onConfirmEmailChange: vi.fn(),
    onStartDelete: vi.fn(),
    onCancelDelete: vi.fn(),
    onCommitDelete: vi.fn(),
    deleting: false,
    onResetPassword: vi.fn(),
    resettingPassword: false,
  };
}

function renderRow(propsOverrides: Partial<ReturnType<typeof defaultProps>> = {}) {
  const props = { ...defaultProps(), ...propsOverrides };
  // <tr> needs a <table><tbody> parent or RTL warns about invalid DOM nesting.
  return render(
    <table>
      <tbody>
        <UserRow {...props} />
      </tbody>
    </table>,
  );
}

describe("UserRow — main row", () => {
  it("renders name, email, role badge, and coverage cell", () => {
    renderRow();
    expect(screen.getByText("Lina Smith")).toBeInTheDocument();
    expect(screen.getByText("lina@example.com")).toBeInTheDocument();
    expect(screen.getByText("user")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument(); // 3+1=4 of 10
  });

  it("falls back to em-dash when name is empty", () => {
    renderRow({ user: user({ name: "" }) });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("admins get the admin-styled role badge", () => {
    renderRow({ user: user({ role: "admin" }) });
    const badge = screen.getByText("admin");
    expect(badge.className).toMatch(/accent-300/);
  });

  it("invokes onOpenCalendar when the coverage pie is clicked", async () => {
    const onOpenCalendar = vi.fn();
    renderRow({ onOpenCalendar });
    await userEvent.click(screen.getByRole("button", { name: /availability calendar/i }));
    expect(onOpenCalendar).toHaveBeenCalledOnce();
  });

  it("invokes onToggleInventory on the Manage chip; label flips when expanded", () => {
    const onToggleInventory = vi.fn();
    const { rerender } = renderRow({ onToggleInventory });
    expect(screen.getByText("Manage")).toBeInTheDocument();
    rerender(
      <table>
        <tbody>
          <UserRow {...{ ...defaultProps(), onToggleInventory, expanded: true }} />
        </tbody>
      </table>,
    );
    expect(screen.getByText("Close")).toBeInTheDocument();
  });
});

// The row picker uses ONLINE_MODE_OPTIONS_COMPACT to keep the segmented
// control inside the table's Online column — labels are Off / Both / On,
// not the full Offline / Online used by the pre-register card.
describe("UserRow — online-mode picker (default mode)", () => {
  function getOption(label: "Off" | "On" | "Both") {
    return screen.getByRole("button", { name: label });
  }

  it("the user's current onlineMode segment reports aria-pressed=true", () => {
    renderRow({ user: user({ onlineMode: "online" }) });
    expect(getOption("On")).toHaveAttribute("aria-pressed", "true");
    expect(getOption("Off")).toHaveAttribute("aria-pressed", "false");
    expect(getOption("Both")).toHaveAttribute("aria-pressed", "false");
  });

  it("defaults to Off pressed when onlineMode is unset (legacy row)", () => {
    renderRow({ user: user({ onlineMode: undefined }) });
    expect(getOption("Off")).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking a different segment fires onSetOnlineMode with that value", async () => {
    const onSetOnlineMode = vi.fn();
    renderRow({ user: user({ onlineMode: "offline" }), onSetOnlineMode });
    await userEvent.click(getOption("Both"));
    expect(onSetOnlineMode).toHaveBeenCalledWith("both");
  });

  it("clicking the already-active segment is a no-op", async () => {
    const onSetOnlineMode = vi.fn();
    renderRow({ user: user({ onlineMode: "offline" }), onSetOnlineMode });
    await userEvent.click(getOption("Off"));
    expect(onSetOnlineMode).not.toHaveBeenCalled();
  });

  it("all segments are disabled while pending", () => {
    renderRow({ pending: true });
    expect(getOption("Off")).toBeDisabled();
    expect(getOption("Both")).toBeDisabled();
    expect(getOption("On")).toBeDisabled();
  });
});

describe("UserRow — delete mode", () => {
  it("shows Delete chip for a normal user", () => {
    renderRow({ deleteMode: true });
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("shows 'you' pill (inert) when isSelf is true", () => {
    renderRow({ deleteMode: true, isSelf: true });
    expect(screen.getByText("you")).toBeInTheDocument();
    expect(screen.queryByText("Delete")).toBeNull();
  });

  it("shows 'Confirm below…' hint while the confirm sub-row is open", () => {
    renderRow({ deleteMode: true, confirmingDelete: true });
    expect(screen.getByText(/Confirm below/)).toBeInTheDocument();
  });

  it("fires onStartDelete when the Delete chip is clicked", async () => {
    const onStartDelete = vi.fn();
    renderRow({ deleteMode: true, onStartDelete });
    await userEvent.click(screen.getByText("Delete"));
    expect(onStartDelete).toHaveBeenCalledOnce();
  });

  it("hides the online-mode picker entirely in delete mode", () => {
    renderRow({ deleteMode: true });
    expect(screen.queryByRole("group", { name: /Online mode for/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Off" })).toBeNull();
  });
});

describe("UserRow — delete confirmation row", () => {
  it("renders the confirmation row only when confirmingDelete is true", () => {
    const { rerender } = renderRow({ deleteMode: true, confirmingDelete: false });
    expect(screen.queryByText(/to confirm permanent deletion/)).toBeNull();
    rerender(
      <table>
        <tbody>
          <UserRow {...{ ...defaultProps(), deleteMode: true, confirmingDelete: true }} />
        </tbody>
      </table>,
    );
    expect(screen.getByText(/to confirm permanent deletion/)).toBeInTheDocument();
  });

  it("disables the Delete-user button until the email matches (case-insensitive)", async () => {
    const onConfirmEmailChange = vi.fn();
    let confirmEmail = "";
    function rerenderWith(next: string) {
      return rerender(
        <table>
          <tbody>
            <UserRow
              {...{
                ...defaultProps(),
                deleteMode: true,
                confirmingDelete: true,
                confirmEmail: next,
                onConfirmEmailChange,
              }}
            />
          </tbody>
        </table>,
      );
    }
    const { rerender } = renderRow({
      deleteMode: true,
      confirmingDelete: true,
      confirmEmail,
      onConfirmEmailChange,
    });

    expect(screen.getByRole("button", { name: "Delete user" })).toBeDisabled();
    // Email-match (case-insensitive on both sides).
    confirmEmail = "LINA@example.com";
    rerenderWith(confirmEmail);
    expect(screen.getByRole("button", { name: "Delete user" })).not.toBeDisabled();
  });

  it("fires onCommitDelete when the destructive button is clicked", async () => {
    const onCommitDelete = vi.fn();
    renderRow({
      deleteMode: true,
      confirmingDelete: true,
      confirmEmail: "lina@example.com",
      onCommitDelete,
    });
    await userEvent.click(screen.getByRole("button", { name: "Delete user" }));
    expect(onCommitDelete).toHaveBeenCalledOnce();
  });

  it("fires onCancelDelete when Cancel is clicked", async () => {
    const onCancelDelete = vi.fn();
    renderRow({ deleteMode: true, confirmingDelete: true, onCancelDelete });
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancelDelete).toHaveBeenCalledOnce();
  });
});

describe("UserRow — inventory expansion", () => {
  it("renders the InventoryPanel only when expanded is true", () => {
    const { rerender } = renderRow();
    expect(screen.queryByTestId("inv-u1")).toBeNull();
    rerender(
      <table>
        <tbody>
          <UserRow {...{ ...defaultProps(), expanded: true }} />
        </tbody>
      </table>,
    );
    expect(screen.getByTestId("inv-u1")).toBeInTheDocument();
  });
});
