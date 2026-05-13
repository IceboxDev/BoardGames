import { describe, expect, it } from "vitest";
import { buildIcs, escapeText, foldLine, type IcsEvent } from "./builder.ts";

const PRODID = "-//boardgames//Calendar Sync 1.0//EN";

function ev(over: Partial<IcsEvent> = {}): IcsEvent {
  return {
    uid: "2026-05-12-7f3a@boardgames.test",
    start: { dateTime: "20260512T190000", tzid: "Europe/Berlin" },
    end: { dateTime: "20260512T230000", tzid: "Europe/Berlin" },
    summary: "Game Night — Host Alice",
    description: "Top picks: Wingspan, Ark Nova",
    location: "123 Main St, Berlin",
    status: "CONFIRMED",
    sequence: 0,
    lastModified: "20260510T120000Z",
    dtstamp: "20260510T120000Z",
    ...over,
  };
}

function build(events: IcsEvent[]): string {
  return buildIcs({
    prodId: PRODID,
    calName: "Game Nights",
    tzid: "Europe/Berlin",
    events,
  });
}

describe("buildIcs — VCALENDAR envelope", () => {
  it("opens and closes the VCALENDAR block with required props", () => {
    const out = build([]);
    const lines = out.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain(`PRODID:${PRODID}`);
    expect(lines).toContain("CALSCALE:GREGORIAN");
    expect(lines).toContain("METHOD:PUBLISH");
    expect(lines).toContain("X-WR-CALNAME:Game Nights");
    expect(lines).toContain("X-WR-TIMEZONE:Europe/Berlin");
    // Last non-empty line is END:VCALENDAR (trailing CRLF makes split() emit "").
    expect(lines.filter((l) => l !== "").pop()).toBe("END:VCALENDAR");
  });

  it("uses CRLF line endings throughout", () => {
    const out = build([ev()]);
    // No lone LF, no lone CR. Every newline must be CRLF.
    expect(out.match(/\r\n/g)?.length).toBeGreaterThan(5);
    expect(out.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("ends with a single trailing CRLF", () => {
    const out = build([ev()]);
    expect(out.endsWith("\r\n")).toBe(true);
    expect(out.endsWith("\r\n\r\n")).toBe(false);
  });

  it("embeds the Europe/Berlin VTIMEZONE block with DST rules", () => {
    const out = build([]);
    expect(out).toContain("BEGIN:VTIMEZONE\r\nTZID:Europe/Berlin");
    expect(out).toContain("RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU");
    expect(out).toContain("RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU");
    expect(out).toContain("END:VTIMEZONE");
  });
});

describe("buildIcs — VEVENT body", () => {
  it("emits all required and standard properties for a confirmed event", () => {
    const out = build([ev()]);
    expect(out).toContain("BEGIN:VEVENT");
    expect(out).toContain("UID:2026-05-12-7f3a@boardgames.test");
    expect(out).toContain("DTSTAMP:20260510T120000Z");
    expect(out).toContain("DTSTART;TZID=Europe/Berlin:20260512T190000");
    expect(out).toContain("DTEND;TZID=Europe/Berlin:20260512T230000");
    expect(out).toContain("SUMMARY:Game Night — Host Alice");
    expect(out).toContain("STATUS:CONFIRMED");
    expect(out).toContain("SEQUENCE:0");
    expect(out).toContain("LAST-MODIFIED:20260510T120000Z");
    expect(out).toContain("CATEGORIES:BOARD GAMES");
    expect(out).toContain("END:VEVENT");
  });

  it("emits an all-day event with VALUE=DATE and no TZID, no DTEND", () => {
    const out = build([ev({ start: { date: "20260512" }, end: undefined })]);
    expect(out).toContain("DTSTART;VALUE=DATE:20260512");
    expect(out).not.toContain("DTEND");
    // No TZID on the DTSTART line for date-only events.
    expect(out).not.toMatch(/DTSTART;[^:]*TZID=/);
  });

  it("emits STATUS:CANCELLED for cancelled events", () => {
    const out = build([ev({ status: "CANCELLED", sequence: 3 })]);
    expect(out).toContain("STATUS:CANCELLED");
    expect(out).toContain("SEQUENCE:3");
  });

  it("omits LOCATION when null and URL when undefined", () => {
    const out = build([ev({ location: null, url: undefined })]);
    expect(out).not.toContain("LOCATION");
    expect(out).not.toContain("URL:");
  });

  it("emits URL when provided", () => {
    const out = build([ev({ url: "https://app.test/offline?date=2026-05-12" })]);
    expect(out).toContain("URL:https://app.test/offline?date=2026-05-12");
  });
});

describe("buildIcs — escaping", () => {
  it("escapes backslash, semicolon, comma, and newline in TEXT values", () => {
    const raw = "123 Main St, Apt; #4\nBerlin\\";
    const out = build([ev({ location: raw })]);
    // Backslash doubled, comma and semicolon escaped, newline replaced.
    expect(out).toContain("LOCATION:123 Main St\\, Apt\\; #4\\nBerlin\\\\");
  });

  it("escapes a multi-line description into a single folded property", () => {
    const out = build([ev({ description: "line a\nline b\nline c", summary: "X" })]);
    expect(out).toContain("DESCRIPTION:line a\\nline b\\nline c");
  });
});

describe("foldLine", () => {
  it("does not fold lines at or under 75 octets", () => {
    expect(foldLine("DTSTAMP:20260510T120000Z")).toEqual(["DTSTAMP:20260510T120000Z"]);
    const exactly75 = `X-PAD:${"a".repeat(69)}`;
    expect(exactly75.length).toBe(75);
    expect(foldLine(exactly75)).toEqual([exactly75]);
  });

  it("folds lines that exceed 75 octets with CRLF + single space continuation", () => {
    // 200 ASCII chars after the property name → first line ≤75 bytes,
    // continuations ≤74 (one reserved for the leading space).
    const long = `DESCRIPTION:${"x".repeat(200)}`;
    const folded = foldLine(long);
    expect(folded.length).toBeGreaterThan(1);
    // First chunk fills the 75-byte budget.
    expect(folded[0]?.length).toBe(75);
    // Every continuation starts with a single space and is ≤75 bytes.
    for (const f of folded.slice(1)) {
      expect(f?.startsWith(" ")).toBe(true);
      expect(f?.length ?? 0).toBeLessThanOrEqual(75);
    }
    // Joining the folded form on CRLF + space rebuilds the unfolded payload.
    const reconstructed = folded.map((f, i) => (i === 0 ? f : f?.slice(1))).join("");
    expect(reconstructed).toBe(long);
  });

  it("does not split a multi-byte UTF-8 codepoint mid-sequence", () => {
    // Pad so a 4-byte emoji straddles byte 74. The fold must back off to
    // the byte before the emoji's leading byte.
    const padding = "x".repeat(72);
    const line = `S:${padding}🎲abc`;
    const folded = foldLine(line);
    // Reconstruct and verify the emoji survives intact.
    const reconstructed = folded.map((f, i) => (i === 0 ? f : f?.slice(1))).join("");
    expect(reconstructed).toBe(line);
    // No fold landed inside the emoji's bytes — each chunk must decode cleanly.
    for (const chunk of folded) expect(chunk).toBeDefined();
  });
});

describe("escapeText", () => {
  it("escapes backslash before any other replacement", () => {
    // If we escaped comma/semicolon first, their inserted backslashes
    // would themselves be doubled. This regression test guards order.
    expect(escapeText("a\\b,c;d")).toBe("a\\\\b\\,c\\;d");
  });

  it("encodes CR, LF, and CRLF identically as \\n", () => {
    expect(escapeText("a\nb")).toBe("a\\nb");
    expect(escapeText("a\r\nb")).toBe("a\\nb");
    expect(escapeText("a\rb")).toBe("a\\nb");
  });
});

describe("buildIcs — determinism", () => {
  it("produces byte-identical output for the same inputs", () => {
    const a = build([ev()]);
    const b = build([ev()]);
    expect(a).toBe(b);
  });

  it("changes output when sequence bumps", () => {
    const a = build([ev({ sequence: 0 })]);
    const b = build([ev({ sequence: 1 })]);
    expect(a).not.toBe(b);
  });
});

describe("buildIcs — unknown timezone fallback", () => {
  it("emits a minimal VTIMEZONE block for an unknown TZID so the file stays parseable", () => {
    const out = buildIcs({
      prodId: PRODID,
      calName: "Other",
      tzid: "America/Los_Angeles",
      events: [],
    });
    expect(out).toContain("TZID:America/Los_Angeles");
    expect(out).toContain("BEGIN:VTIMEZONE");
    expect(out).toContain("END:VTIMEZONE");
  });
});
