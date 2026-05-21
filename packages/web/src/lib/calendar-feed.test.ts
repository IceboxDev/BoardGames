import { describe, expect, it } from "vitest";
import { buildCalendarDeepLinks } from "./calendar-feed";

describe("buildCalendarDeepLinks", () => {
  const subscribeUrl = "https://api.example.com/calendar/feed/abc123.ics";
  const webcalUrl = "webcal://api.example.com/calendar/feed/abc123.ics";

  it('Google uses webcal URL in the "cid" param', () => {
    const links = buildCalendarDeepLinks({ subscribeUrl, webcalUrl });
    expect(links.google).toBe(
      `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(webcalUrl)}`,
    );
  });

  it("Apple is the raw webcal URL", () => {
    const links = buildCalendarDeepLinks({ subscribeUrl, webcalUrl });
    expect(links.apple).toBe(webcalUrl);
  });

  it("Outlook uses the https URL and adds a name", () => {
    const links = buildCalendarDeepLinks({ subscribeUrl, webcalUrl });
    expect(links.outlook).toBe(
      `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(
        subscribeUrl,
      )}&name=${encodeURIComponent("Game Nights")}`,
    );
  });

  it("URL-encodes characters that would otherwise break the deep link", () => {
    const links = buildCalendarDeepLinks({
      subscribeUrl: "https://example.com/path?a=1&b=2",
      webcalUrl: "webcal://example.com/path?a=1&b=2",
    });
    // The `&` inside the embedded URL must be encoded so it isn't read as a
    // separator by Google / Outlook's query parser.
    expect(links.google).toContain("%26");
    expect(links.outlook).toContain("%26");
  });
});
