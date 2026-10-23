import { describe, expect, it } from "vitest";
import type {
  ArticleEvidence,
  Assessment,
  Claim,
  EvidenceSource,
  SourceKind,
  Verdict,
} from "./evidence-types.ts";
import {
  domainFamily,
  factGrade,
  gradeDistribution,
  registrableDomain,
  sourceFamily,
} from "./grade.ts";

const SNAP = "a".repeat(64);

function src(url: string, kind: SourceKind = "encyclopedia", over: Partial<EvidenceSource> = {}) {
  return { url, kind, lang: "en", retrievedAt: "2026-10-23", snapshot: SNAP, ...over };
}

let n = 0;
function assess(
  support: { s: string; verbatim?: boolean; verifiedAt?: string }[],
  over: { verdict?: Verdict; claim?: Claim; at?: string; target?: string } = {},
): Assessment {
  n++;
  return {
    id: `e${n}`,
    at: over.at ?? "2026-10-23",
    target: over.target ?? "f00001",
    claim: over.claim ?? "answer",
    verdict: over.verdict ?? "confirmed",
    confidence: "high",
    support: support.map(({ s, verbatim = true, verifiedAt }) => ({
      source: s,
      quote: "q",
      quoteLang: "en",
      verbatim,
      ...(verifiedAt ? { verifiedAt } : {}),
    })),
    by: "test",
  };
}

const ledger = (
  sources: Record<string, EvidenceSource>,
  assessments: Assessment[],
): ArticleEvidence => ({ article: "a0001", sources, assessments });

const grade = (e: ArticleEvidence) => factGrade("f00001", e).grade;

const WP = "https://en.wikipedia.org/wiki/Rome";
const BRIT = "https://www.britannica.com/place/Rome";
const GOV = "https://www.comune.roma.it/storia";

describe("domains", () => {
  it("finds registrable domains", () => {
    expect(registrableDomain("de.m.wikipedia.org")).toBe("wikipedia.org");
    expect(registrableDomain("www.bbc.co.uk")).toBe("bbc.co.uk");
    expect(registrableDomain("news.bbc.co.uk")).toBe("bbc.co.uk");
    expect(registrableDomain("example.com")).toBe("example.com");
    expect(registrableDomain("www.abc.net.au")).toBe("abc.net.au");
  });

  it("folds mirrors and language editions into wikipedia.org", () => {
    expect(domainFamily("www.wikiwand.com")).toBe("wikipedia.org");
    expect(domainFamily("dbpedia.org")).toBe("wikipedia.org");
    expect(domainFamily("de.wikipedia.org")).toBe("wikipedia.org");
    expect(domainFamily("www.wikidata.org")).toBe("wikipedia.org");
    expect(domainFamily("alchetron.com")).toBe("wikipedia.org");
    expect(domainFamily("encyclopedia2.thefreedictionary.com")).toBe("wikipedia.org");
    expect(domainFamily("www.thefreedictionary.com")).toBe("thefreedictionary.com");
    expect(domainFamily("www.britannica.com")).toBe("britannica.com");
  });

  it("follows cloneOf to a source or a domain", () => {
    const sources = {
      s1: src(BRIT),
      s2: src("https://copycat.example/rome", "other", { cloneOf: "s1" }),
      s3: src("https://another.example/rome", "other", { cloneOf: "s2" }),
      s4: src("https://mirror.example/rome", "other", { cloneOf: "wikipedia.org" }),
      s5: src("https://loop.example", "other", { cloneOf: "s6" }),
      s6: src("https://loop2.example", "other", { cloneOf: "s5" }),
    };
    expect(sourceFamily("s2", sources)).toBe("britannica.com");
    expect(sourceFamily("s3", sources)).toBe("britannica.com");
    expect(sourceFamily("s4", sources)).toBe("wikipedia.org");
    expect(sourceFamily("s5", sources)).toMatch(/loop/);
  });
});

describe("factGrade", () => {
  it("E without a ledger, without assessments of the fact, or with only card-says", () => {
    expect(factGrade("f00001", undefined)).toEqual({
      grade: "E",
      independentSources: 0,
      verbatim: 0,
      primary: 0,
      contested: false,
      latestConfidence: null,
    });
    expect(grade(ledger({ s1: src(WP) }, [assess([{ s: "s1" }], { target: "f00002" })]))).toBe("E");
    expect(grade(ledger({ s1: src(WP) }, [assess([{ s: "s1" }], { claim: "card-says" })]))).toBe(
      "E",
    );
  });

  it("D when the answer isn't verified on the source", () => {
    // Not verbatim.
    expect(grade(ledger({ s1: src(WP) }, [assess([{ s: "s1", verbatim: false }])]))).toBe("D");
    // Verbatim but nothing machine-checked it (no snapshot, no verifiedAt).
    expect(
      grade(
        ledger({ s1: src(WP, "encyclopedia", { snapshot: undefined }) }, [assess([{ s: "s1" }])]),
      ),
    ).toBe("D");
    // Only an unverified verdict.
    expect(grade(ledger({ s1: src(WP) }, [assess([{ s: "s1" }], { verdict: "unverified" })]))).toBe(
      "D",
    );
  });

  it("C with one verbatim-verified source (snapshot or verifiedAt)", () => {
    expect(grade(ledger({ s1: src(WP) }, [assess([{ s: "s1" }])]))).toBe("C");
    expect(
      grade(
        ledger({ s1: src(WP, "encyclopedia", { snapshot: undefined }) }, [
          assess([{ s: "s1", verifiedAt: "2026-10-23" }]),
        ]),
      ),
    ).toBe("C");
  });

  it("counts clones, mirrors, language editions and one site as one source", () => {
    const sameFamily = [
      { s2: src("https://de.wikipedia.org/wiki/Rom") },
      { s2: src("https://www.wikiwand.com/en/Rome") },
      { s2: src("https://copy.example/rome", "other", { cloneOf: "s1" }) },
    ];
    for (const extra of sameFamily) {
      const r = factGrade(
        "f00001",
        ledger({ s1: src(WP), ...extra }, [assess([{ s: "s1" }, { s: "s2" }])]),
      );
      expect(r.grade).toBe("C");
      expect(r.independentSources).toBe(1);
    }
    expect(
      grade(
        ledger({ s1: src(BRIT), s2: src("https://www.britannica.com/topic/Romulus") }, [
          assess([{ s: "s1" }, { s: "s2" }]),
        ]),
      ),
    ).toBe("C");
  });

  it("B with two independent verbatim-verified sources, or one primary", () => {
    const r = factGrade(
      "f00001",
      ledger({ s1: src(WP), s2: src(BRIT) }, [assess([{ s: "s1" }, { s: "s2" }])]),
    );
    expect(r).toMatchObject({ grade: "B", independentSources: 2, verbatim: 2, primary: 0 });
    expect(grade(ledger({ s1: src(GOV, "official") }, [assess([{ s: "s1" }])]))).toBe("B");
    expect(grade(ledger({ s1: src(GOV, "scholarly") }, [assess([{ s: "s1" }])]))).toBe("B");
    // A primary source without a verified quote is no B.
    expect(
      grade(ledger({ s1: src(GOV, "primary") }, [assess([{ s: "s1", verbatim: false }])])),
    ).toBe("D");
    // Two sources but only one verified: C.
    expect(
      grade(
        ledger({ s1: src(WP), s2: src(BRIT) }, [
          assess([{ s: "s1" }, { s: "s2", verbatim: false }]),
        ]),
      ),
    ).toBe("C");
  });

  it("A with ≥2 independent, all verified, one primary, nothing contested", () => {
    const sources = { s1: src(WP), s2: src(GOV, "official"), s3: src(BRIT) };
    const r = factGrade("f00001", ledger(sources, [assess([{ s: "s1" }, { s: "s2" }])]));
    expect(r).toMatchObject({ grade: "A", independentSources: 2, verbatim: 2, primary: 1 });
    // A third confirmed source without a verified quote: not all verified → B.
    expect(
      grade(ledger(sources, [assess([{ s: "s1" }, { s: "s2" }, { s: "s3", verbatim: false }])])),
    ).toBe("B");
    // Two primary pages of one site are one source: B (one primary), not A.
    expect(
      grade(
        ledger({ s1: src(GOV, "official"), s2: src("https://www.comune.roma.it/x", "official") }, [
          assess([{ s: "s1" }, { s: "s2" }]),
        ]),
      ),
    ).toBe("B");
  });

  it("E while a contest or refutation stands; a later confirmation resolves it", () => {
    const sources = { s1: src(WP), s2: src(GOV, "official") };
    const both = [{ s: "s1" }, { s: "s2" }];
    const contested = ledger(sources, [
      assess(both, { at: "2026-10-20" }),
      assess([], { verdict: "contested", at: "2026-10-21" }),
    ]);
    expect(factGrade("f00001", contested)).toMatchObject({ grade: "E", contested: true });
    // An unverified look afterwards doesn't resolve it.
    contested.assessments.push(assess([], { verdict: "unverified", at: "2026-10-22" }));
    expect(grade(contested)).toBe("E");
    // A premise refutation is a contest too.
    expect(
      grade(ledger(sources, [assess(both), assess([], { verdict: "refuted", claim: "premise" })])),
    ).toBe("E");
    // Resolved by a later confirmation.
    contested.assessments.push(assess(both, { at: "2026-10-23" }));
    expect(factGrade("f00001", contested)).toMatchObject({ grade: "A", contested: false });
  });

  it("uses each source's latest answer assessment", () => {
    const sources = { s1: src(WP), s2: src(BRIT) };
    const e = ledger(sources, [
      assess([{ s: "s1" }, { s: "s2" }], { at: "2026-10-20" }),
      // s2 later not found on the page any more.
      assess([{ s: "s2", verbatim: false }], { verdict: "unverified", at: "2026-10-22" }),
    ]);
    expect(factGrade("f00001", e)).toMatchObject({ grade: "C", independentSources: 1 });
    // File order breaks ties of the same day: the later line wins.
    const tie = ledger(sources, [
      assess([{ s: "s1" }], { verdict: "unverified", at: "2026-10-22" }),
      assess([{ s: "s1" }], { at: "2026-10-22" }),
    ]);
    expect(grade(tie)).toBe("C");
    // Assessments appended out of date order are still read by date.
    const shuffled = ledger(sources, [
      assess([{ s: "s1" }], { at: "2026-10-25" }),
      assess([{ s: "s1" }], { verdict: "unverified", at: "2026-10-01" }),
    ]);
    expect(grade(shuffled)).toBe("C");
  });

  it("reports the latest confidence and a distribution", () => {
    const a = assess([{ s: "s1" }], { at: "2026-10-25" });
    a.confidence = "medium";
    const e = ledger({ s1: src(WP) }, [assess([{ s: "s1" }], { at: "2026-10-01" }), a]);
    expect(factGrade("f00001", e).latestConfidence).toBe("medium");
    expect(gradeDistribution(["A", "C", "C", "E"])).toEqual({ A: 1, B: 0, C: 2, D: 0, E: 1 });
  });
});
