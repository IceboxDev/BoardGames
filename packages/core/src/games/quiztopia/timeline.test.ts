import { describe, expect, it } from "vitest";
import {
  centuryOf,
  compareTimelineDates,
  ERAS,
  eraOf,
  formatSpan,
  formatTimelineDate,
  millenniumOf,
  parseEvent,
  parseTimelineDate,
  precisionFitsDate,
  type TimelineEvent,
  timelineScale,
  timelineSortKey,
  timelineSpanYears,
} from "./timeline.ts";

function ev(partial: Partial<TimelineEvent> & Pick<TimelineEvent, "start">): TimelineEvent {
  return {
    kind: "event",
    end: null,
    precision: "year",
    approx: false,
    ongoing: false,
    labelEn: "x",
    labelDe: "x",
    ...partial,
  };
}

const key = (s: string) => {
  const d = parseTimelineDate(s);
  if (!d) throw new Error(`bad ${s}`);
  return timelineSortKey(d);
};

describe("parseTimelineDate", () => {
  it("reads years, months, days, BC and deep time", () => {
    expect(parseTimelineDate("1841-08-26")).toEqual({ year: 1841, month: 8, day: 26 });
    expect(parseTimelineDate("1841-08")).toEqual({ year: 1841, month: 8, day: null });
    expect(parseTimelineDate("1841")).toEqual({ year: 1841, month: null, day: null });
    expect(parseTimelineDate("-44-03-15")).toEqual({ year: -44, month: 3, day: 15 });
    expect(parseTimelineDate("-66000000")).toEqual({ year: -66_000_000, month: null, day: null });
    expect(parseTimelineDate("-13800000000")?.year).toBe(-13_800_000_000);
  });

  it("rejects year 0, impossible months and days, and junk", () => {
    expect(parseTimelineDate("0")).toBeNull();
    expect(parseTimelineDate("-0")).toBeNull();
    expect(parseTimelineDate("1841-13")).toBeNull();
    expect(parseTimelineDate("1841-02-30")).toBeNull();
    expect(parseTimelineDate("1841-00")).toBeNull();
    expect(parseTimelineDate("1841/08/26")).toBeNull();
    expect(parseTimelineDate("c. 1841")).toBeNull();
    expect(parseTimelineDate("")).toBeNull();
  });
});

describe("sort key", () => {
  it("is monotonic across BC/AD, with no year 0 between 1 BC and AD 1", () => {
    const ordered = [
      "-13800000000",
      "-66000000",
      "-3000",
      "-44-03-15",
      "-44-12",
      "-1",
      "1",
      "79-08-24",
      "1200",
      "1841-08",
      "1841-08-26",
      "1841-08-27",
      "1841-09-01",
      "1842",
    ];
    const keys = ordered.map(key);
    for (let i = 1; i < keys.length; i++) expect(keys[i]).toBeGreaterThan(keys[i - 1]);
    expect(key("1") - key("-1")).toBe(1);
    expect(key("1841-12-31")).toBeLessThan(key("1842"));
  });

  it("compares strictly like the content checker (a bare year before its first month)", () => {
    const a = parseTimelineDate("1898");
    const b = parseTimelineDate("1898-01");
    const c = parseTimelineDate("1898-01-01");
    if (!a || !b || !c) throw new Error("parse");
    expect(compareTimelineDates(a, b)).toBeLessThan(0);
    expect(compareTimelineDates(b, c)).toBeLessThan(0);
    expect(compareTimelineDates(c, c)).toBe(0);
  });

  it("checks precision against the date's shape", () => {
    expect(precisionFitsDate("1841-08-26", "day")).toBe(true);
    expect(precisionFitsDate("1841-08-26", "year")).toBe(false);
    expect(precisionFitsDate("1841-08", "month")).toBe(true);
    expect(precisionFitsDate("-44", "century")).toBe(true);
    expect(precisionFitsDate("1841", "day")).toBe(false);
  });
});

describe("parseEvent", () => {
  it("keys points, intervals and ongoing spans", () => {
    const point = parseEvent(ev({ start: "1841-08-26" }));
    expect(point?.endKey).toBe(point?.startKey);
    const life = parseEvent(ev({ kind: "lifespan", start: "1898-07-06", end: "1962-09-06" }));
    expect(life?.endKey).toBeGreaterThan(life?.startKey ?? 0);
    const now = { year: 2026, month: 9, day: 24 };
    const living = parseEvent(ev({ kind: "lifespan", start: "1954", ongoing: true }), now);
    expect(living?.endKey).toBe(timelineSortKey(now));
    expect(parseEvent(ev({ start: "nope" }))).toBeNull();
  });

  it("measures the span of a collection", () => {
    const events = ["-1000", "1990"].map((s) => parseEvent(ev({ start: s })));
    expect(timelineSpanYears(events.filter((e) => e !== null))).toBe(2989);
    expect(timelineSpanYears([])).toBe(0);
  });
});

describe("formatTimelineDate", () => {
  it("formats days, months and years in both languages", () => {
    const day = ev({ start: "1841-08-26", precision: "day" });
    expect(formatTimelineDate(day, "en")).toBe("26 August 1841");
    expect(formatTimelineDate(day, "de")).toBe("26. August 1841");
    const month = ev({ start: "1969-07", precision: "month" });
    expect(formatTimelineDate(month, "en")).toBe("July 1969");
    expect(formatTimelineDate(month, "de")).toBe("Juli 1969");
    expect(formatTimelineDate(ev({ start: "1841" }), "en")).toBe("1841");
  });

  it("marks BC and early AD", () => {
    expect(formatTimelineDate(ev({ start: "-44" }), "en")).toBe("44 BC");
    expect(formatTimelineDate(ev({ start: "-44" }), "de")).toBe("44 v. Chr.");
    const ides = ev({ start: "-44-03-15", precision: "day" });
    expect(formatTimelineDate(ides, "en")).toBe("15 March 44 BC");
    expect(formatTimelineDate(ides, "de")).toBe("15. März 44 v. Chr.");
    expect(formatTimelineDate(ev({ start: "79" }), "en")).toBe("AD 79");
    expect(formatTimelineDate(ev({ start: "79" }), "de")).toBe("79 n. Chr.");
  });

  it("formats coarse precisions and approximations", () => {
    const c13 = ev({ start: "1200", precision: "century", approx: true });
    expect(formatTimelineDate(c13, "en")).toBe("c. 13th century");
    expect(formatTimelineDate(c13, "de")).toBe("um 1200");
    const c13exact = ev({ start: "1201", precision: "century" });
    expect(formatTimelineDate(c13exact, "en")).toBe("13th century");
    expect(formatTimelineDate(c13exact, "de")).toBe("13. Jahrhundert");
    expect(formatTimelineDate(ev({ start: "-450", precision: "century" }), "en")).toBe(
      "5th century BC",
    );
    expect(formatTimelineDate(ev({ start: "1920", precision: "decade" }), "en")).toBe("1920s");
    expect(formatTimelineDate(ev({ start: "1920", precision: "decade" }), "de")).toBe(
      "1920er Jahre",
    );
    expect(formatTimelineDate(ev({ start: "-3000", precision: "millennium" }), "en")).toBe(
      "3rd millennium BC",
    );
    expect(formatTimelineDate(ev({ start: "-3000", precision: "millennium" }), "de")).toBe(
      "3. Jahrtausend v. Chr.",
    );
    expect(formatTimelineDate(ev({ start: "1500", approx: true }), "en")).toBe("c. 1500");
    expect(formatTimelineDate(ev({ start: "1500", approx: true }), "de")).toBe("um 1500");
  });

  it("formats deep time as years ago", () => {
    const kt = ev({ start: "-66000000", precision: "megayear" });
    expect(formatTimelineDate(kt, "en")).toBe("66 million years ago");
    expect(formatTimelineDate(kt, "de")).toBe("vor 66 Millionen Jahren");
    const bang = ev({ start: "-13800000000", precision: "megayear", approx: true });
    expect(formatTimelineDate(bang, "en")).toBe("c. 13.8 billion years ago");
    expect(formatTimelineDate(bang, "de")).toBe("vor etwa 13,8 Milliarden Jahren");
    const sapiens = ev({ start: "-300000", precision: "megayear" });
    expect(formatTimelineDate(sapiens, "en")).toBe("300,000 years ago");
    expect(formatTimelineDate(sapiens, "de")).toBe("vor 300.000 Jahren");
  });

  it("formats intervals, ongoing spans and living people", () => {
    const eisler = ev({
      kind: "lifespan",
      start: "1898-07-06",
      end: "1962-09-06",
      precision: "day",
    });
    expect(formatTimelineDate(eisler, "en")).toBe("1898 – 1962");
    expect(formatTimelineDate(eisler, "en", { full: true })).toBe("6 July 1898 – 6 September 1962");
    expect(formatTimelineDate(eisler, "de", { full: true })).toBe(
      "6. Juli 1898 – 6. September 1962",
    );
    const caesar = ev({ kind: "lifespan", start: "-100", end: "-44" });
    expect(formatTimelineDate(caesar, "en")).toBe("100 – 44 BC");
    expect(formatTimelineDate(caesar, "de")).toBe("100 – 44 v. Chr.");
    const augustus = ev({ kind: "reign", start: "-27", end: "14" });
    expect(formatTimelineDate(augustus, "en")).toBe("27 BC – AD 14");
    const tiberius = ev({ kind: "reign", start: "14", end: "37" });
    expect(formatTimelineDate(tiberius, "en")).toBe("AD 14 – 37");
    expect(formatTimelineDate(tiberius, "de")).toBe("14 – 37 n. Chr.");
    const running = ev({ kind: "period", start: "1954", ongoing: true });
    expect(formatTimelineDate(running, "en")).toBe("since 1954");
    expect(formatTimelineDate(running, "de")).toBe("seit 1954");
    const living = ev({ kind: "lifespan", start: "1954-03-02", precision: "day", ongoing: true });
    expect(formatTimelineDate(living, "en")).toBe("born 1954");
    expect(formatTimelineDate(living, "de", { full: true })).toBe("geboren 2. März 1954");
    const renaissance = ev({
      kind: "era",
      start: "1401",
      end: "1600",
      precision: "century",
      approx: true,
    });
    expect(formatTimelineDate(renaissance, "en")).toBe("c. 15th–16th century");
    expect(formatTimelineDate(renaissance, "de")).toBe("ca. 15.–16. Jahrhundert");
    expect(formatTimelineDate(ev({ start: "1990", precision: "decade", approx: true }), "de")).toBe(
      "um die 1990er Jahre",
    );
    const dinos = ev({ kind: "era", start: "-252000000", end: "-66000000", precision: "megayear" });
    expect(formatTimelineDate(dinos, "en")).toBe("252 million years ago – 66 million years ago");
  });

  it("falls back to the raw string for a malformed start", () => {
    expect(formatTimelineDate(ev({ start: "circa" }), "en")).toBe("circa");
  });

  it("numbers centuries and millennia", () => {
    expect(centuryOf(1200)).toBe(13);
    expect(centuryOf(1201)).toBe(13);
    expect(centuryOf(1999)).toBe(20);
    expect(centuryOf(-450)).toBe(5);
    expect(centuryOf(-500)).toBe(5);
    expect(millenniumOf(1000)).toBe(1);
    expect(millenniumOf(1001)).toBe(2);
    expect(millenniumOf(-3000)).toBe(3);
  });
});

describe("eras and the display scale", () => {
  it("buckets keys into the seven eras", () => {
    expect(eraOf(key("-66000000")).id).toBe("deep-time");
    expect(eraOf(key("-44")).id).toBe("antiquity");
    expect(eraOf(key("800")).id).toBe("middle-ages");
    expect(eraOf(key("1600")).id).toBe("early-modern");
    expect(eraOf(key("1841")).id).toBe("c19");
    expect(eraOf(key("1969")).id).toBe("c20");
    expect(eraOf(key("2012")).id).toBe("c21");
    expect(ERAS.map((e) => e.id)).toHaveLength(7);
  });

  it("maps time monotonically onto [0, 1], compressing deep time", () => {
    const samples = ["-13800000000", "-66000000", "-10000", "-3000", "-44", "1200", "1900", "2020"];
    const ys = samples.map((s) => timelineScale(key(s)));
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1]);
    expect(ys[0]).toBeCloseTo(0, 5);
    expect(timelineScale(3000)).toBeLessThanOrEqual(1);
    // A year in the 20th century gets far more room than a year in antiquity.
    const modern = timelineScale(1951) - timelineScale(1950);
    const ancient = timelineScale(-1999) - timelineScale(-2000);
    expect(modern).toBeGreaterThan(ancient * 10);
    // Deep time is logarithmic in years before PRESENT: the century before
    // antiquity is a sliver next to the Big Bang → the dinosaurs' end.
    const lateStone = timelineScale(key("-3001")) - timelineScale(key("-3100"));
    const geology = timelineScale(key("-66000000")) - timelineScale(key("-13800000000"));
    expect(lateStone * 50).toBeLessThan(geology);
    // Era boundaries are continuous.
    expect(timelineScale(1500 - 1e-9)).toBeCloseTo(timelineScale(1500), 6);
    expect(timelineScale(-3000 - 1e-6)).toBeCloseTo(timelineScale(-3000), 6);
  });

  it("phrases a span for the hub", () => {
    expect(formatSpan(2989, "en")).toBe("3,000 years");
    expect(formatSpan(2989, "de")).toBe("3.000 Jahre");
    expect(formatSpan(66_000_000, "en")).toBe("66 million years");
    expect(formatSpan(13_800_000_000, "de")).toBe("14 Milliarden Jahre");
    expect(formatSpan(0.5, "en")).toBe("less than a year");
    expect(formatSpan(45, "en")).toBe("45 years");
  });
});
