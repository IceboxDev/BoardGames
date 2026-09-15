import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { qk } from "../../lib/query-keys";
import type { AdminUser } from "./types";

// The drawer is where an admin notes another member's blank days as "away".
// The note is a reminder, not availability: it can only go on a day the
// member has NOT marked, and saving it updates the page's away map (which
// feeds the pie behind the drawer) rather than the member's calendar.

const fetchAvailabilityMock = vi.fn();
const setAwayMock = vi.fn();
vi.mock("../../lib/offline-availability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/offline-availability")>();
  return {
    ...actual,
    adminFetchAvailability: (...args: unknown[]) => fetchAvailabilityMock(...args),
    adminSetAwayDay: (...args: unknown[]) => setAwayMock(...args),
  };
});

import { AvailabilityDrawer } from "./AvailabilityDrawer";

const USER = { id: "u1", name: "Paul", email: "paul@example.com" } as AdminUser;

const dayKey = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const dayNumber = (key: string) => String(Number(key.slice(8, 10)));

/** A promise the test resolves by hand — the server reply, held back. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** What the server holds — the everyone-map refetched once the last tap settles. */
const server: { awayByUser: Record<string, string[]> } = { awayByUser: {} };

/**
 * The page owns the away map and hands the drawer its member's slice, so the
 * drawer here reads it from the same cache the mutation writes — as on the
 * admin page, where the query behind the prop re-renders on every write.
 */
function DrawerHost() {
  const days = useQuery({
    queryKey: qk.adminAwayDays(),
    queryFn: () => Promise.resolve(server.awayByUser),
  }).data?.[USER.id];
  return <AvailabilityDrawer user={USER} awayDays={days ?? []} onClose={() => {}} />;
}

function renderDrawer(awayDays: string[]) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
  server.awayByUser = { [USER.id]: awayDays };
  qc.setQueryData(qk.adminAwayDays(), server.awayByUser);
  render(
    <QueryClientProvider client={qc}>
      <DrawerHost />
    </QueryClientProvider>,
  );
  return qc;
}

/** The enabled (future) cell for a day — the 42-day grid can show a day number twice. */
async function futureCell(key: string) {
  const cells = await screen.findAllByRole("button", {
    name: new RegExp(`^${dayNumber(key)}( — away \\(admin note\\))?$`),
  });
  const cell = cells.find((c) => !(c as HTMLButtonElement).disabled);
  if (!cell) throw new Error(`no enabled cell for ${key}`);
  return cell;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AvailabilityDrawer — away notes", () => {
  it("shows the note the moment it is tapped, before the server has answered", async () => {
    const target = dayKey(3);
    fetchAvailabilityMock.mockResolvedValue({});
    const reply = deferred<string[]>();
    setAwayMock.mockReturnValue(reply.promise);
    const qc = renderDrawer([]);

    await userEvent.click(await futureCell(target));

    // The tap is in the page map (and so on the cell) while the request is
    // still out; the answer only confirms it.
    expect(setAwayMock).toHaveBeenCalledWith(USER.id, target, true);
    expect(qc.getQueryData(qk.adminAwayDays())).toEqual({ [USER.id]: [target] });
    expect(
      screen.getByRole("button", { name: `${dayNumber(target)} — away (admin note)` }),
    ).toHaveAttribute("aria-pressed", "true");
    server.awayByUser = { [USER.id]: [target] };
    reply.resolve([target]);
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    await waitFor(() => expect(qc.isFetching()).toBe(0));
    expect(qc.getQueryData(qk.adminAwayDays())).toEqual({ [USER.id]: [target] });
  });

  it("a tap the server refuses is taken back — and only that tap", async () => {
    const first = dayKey(3);
    const second = dayKey(4);
    fetchAvailabilityMock.mockResolvedValue({});
    const firstReply = deferred<string[]>();
    const secondReply = deferred<string[]>();
    setAwayMock.mockReturnValueOnce(firstReply.promise).mockReturnValueOnce(secondReply.promise);
    const qc = renderDrawer([]);

    await userEvent.click(await futureCell(first));
    await userEvent.click(await futureCell(second));
    expect(qc.getQueryData(qk.adminAwayDays())).toEqual({ [USER.id]: [first, second] });

    firstReply.reject(new Error("the day is already past"));
    await waitFor(() =>
      expect(qc.getQueryData(qk.adminAwayDays())).toEqual({ [USER.id]: [second] }),
    );
    expect(screen.getByText("the day is already past")).toBeInTheDocument();
    server.awayByUser = { [USER.id]: [second] };
    secondReply.resolve([second]);
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    await waitFor(() => expect(qc.isFetching()).toBe(0));
    expect(qc.getQueryData(qk.adminAwayDays())).toEqual({ [USER.id]: [second] });
  });

  it("an older reply never takes back a newer tap still on its way", async () => {
    const first = dayKey(3);
    const second = dayKey(4);
    fetchAvailabilityMock.mockResolvedValue({});
    const firstReply = deferred<string[]>();
    const secondReply = deferred<string[]>();
    setAwayMock.mockReturnValueOnce(firstReply.promise).mockReturnValueOnce(secondReply.promise);
    const qc = renderDrawer([]);

    await userEvent.click(await futureCell(first));
    await userEvent.click(await futureCell(second));

    // The first reply knows nothing of the second tap; adopting it would blank
    // that cell until the second reply lands.
    server.awayByUser = { [USER.id]: [first] };
    firstReply.resolve([first]);
    await waitFor(() => expect(qc.isMutating()).toBe(1));
    expect(qc.isFetching()).toBe(0); // nor is the map refetched from under it
    expect(qc.getQueryData(qk.adminAwayDays())).toEqual({ [USER.id]: [first, second] });
    server.awayByUser = { [USER.id]: [first, second] };
    secondReply.resolve([first, second]);
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    await waitFor(() => expect(qc.isFetching()).toBe(0));
    expect(qc.getQueryData(qk.adminAwayDays())).toEqual({ [USER.id]: [first, second] });
  });

  it("shows a noted day as away, clears it on the next tap, and counts it in the summary", async () => {
    const away = dayKey(5);
    fetchAvailabilityMock.mockResolvedValue({});
    setAwayMock.mockResolvedValue([]);
    renderDrawer([away]);

    const cell = await screen.findByRole("button", {
      name: `${dayNumber(away)} — away (admin note)`,
    });
    expect(cell).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("No availability set · 1 away")).toBeInTheDocument();
    await userEvent.click(cell);
    await waitFor(() => expect(setAwayMock).toHaveBeenCalledWith(USER.id, away, false));
  });

  it("never offers the note on a day the member marked themselves", async () => {
    const marked = dayKey(4);
    fetchAvailabilityMock.mockResolvedValue({ [marked]: "can" });
    renderDrawer([marked]); // a stale note under the member's own mark

    const cell = await screen.findByRole("button", { name: `${dayNumber(marked)} — can` });
    expect(cell).toBeDisabled();
    // The member's mark wins: no "away" in the label, none in the summary.
    expect(screen.queryByRole("button", { name: /away \(admin note\)/ })).toBeNull();
    expect(screen.getByText("1 day marked across the next 6 weeks")).toBeInTheDocument();
  });
});
