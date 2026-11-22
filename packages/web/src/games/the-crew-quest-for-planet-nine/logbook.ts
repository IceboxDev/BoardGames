// The Crew: The Quest for Planet Nine — the 50 missions of the logbook
// (German "Logbuch", transcribed 2026-11-22). The logbook prints no mission
// names, so each title is a short English name drawn from that mission's
// story; the numbers, task counts, task tokens and special rules are the
// printed ones. Drives the match-history mission picker ("#12 Papers
// Everywhere") and the campaign night's mission brief.

/** A task token: a fixed order (1–5), the last task (Ω), or a relative order (> before >>). */
export type TaskToken = "1" | "2" | "3" | "4" | "5" | "Ω" | ">" | ">>" | ">>>" | ">>>>";

/** How talking is limited: the dead zone (?) or the first trick you may communicate on. */
export type CommsRule = "dead-zone" | "from-trick-2" | "from-trick-3";

/**
 * Who takes the tasks when the captain decides: `one` = the captain names one
 * crew member who takes them all; `each` = the captain hands them out one by one.
 */
export type CaptainDeals = "one" | "each";

export type LogbookMission = {
  n: number;
  title: string;
  /** Task cards turned up; null = no task cards, only the special rule. */
  tasks: number | null;
  tokens?: readonly TaskToken[];
  comms?: CommsRule;
  captainDeals?: CaptainDeals;
  /** The mission's special rule, one sentence. */
  rule?: string;
  /** Gold-framed number: the five-player rule applies (from #25 on). */
  fivePlayerRule?: boolean;
};

const RANKING = "At no point may a crew member have won 2 tricks more than another.";

export const PLANET_NINE_LOGBOOK: readonly LogbookMission[] = [
  { n: 1, title: "Teambuilding", tasks: 1 },
  { n: 2, title: "Steering and Weightlessness", tasks: 2 },
  { n: 3, title: "Power and Priorities", tasks: 2, tokens: ["1", "2"] },
  { n: 4, title: "Recalibration", tasks: 3 },
  {
    n: 5,
    title: "Sick Day",
    tasks: null,
    rule: "Everyone checks their hand; the captain asks each only “good” or “bad”, then names the sick crew member, who must win no trick.",
  },
  { n: 6, title: "Radio Silence Drill", tasks: 3, tokens: [">", ">>"], comms: "dead-zone" },
  { n: 7, title: "Lift-Off", tasks: 3, tokens: ["Ω"] },
  { n: 8, title: "Lunar Orbit", tasks: 3, tokens: ["1", "2", "3"] },
  { n: 9, title: "Stuck Metal", tasks: null, rule: "A 1 must win a trick." },
  { n: 10, title: "Leaving the Moon", tasks: 4 },
  {
    n: 11,
    title: "Meteor Field",
    tasks: 4,
    tokens: ["1"],
    rule: "The captain names another crew member to replot the course; they may not communicate this mission.",
  },
  {
    n: 12,
    title: "Papers Everywhere",
    tasks: 4,
    tokens: ["Ω"],
    rule: "Right after the first trick, everyone draws a random card from the player on their right.",
  },
  { n: 13, title: "Thruster Test", tasks: null, rule: "Every rocket card must win a trick." },
  {
    n: 14,
    title: "Olympus Mons",
    tasks: 4,
    tokens: [">", ">>", ">>>"],
    comms: "dead-zone",
  },
  { n: 15, title: "Meteor Strike", tasks: 4, tokens: ["1", "2", "3", "4"] },
  { n: 16, title: "Life Support Down", tasks: null, rule: "No trick may be won with a 9." },
  { n: 17, title: "Still Under Repair", tasks: 2, rule: "Still no trick may be won with a 9." },
  { n: 18, title: "Dust Cloud", tasks: 5, comms: "from-trick-2" },
  { n: 19, title: "Deep in the Cloud", tasks: 5, tokens: ["1"], comms: "from-trick-3" },
  { n: 20, title: "Jupiter", tasks: 2, captainDeals: "one" },
  { n: 21, title: "Jupiter's Pull", tasks: 5, tokens: ["1", "2"], comms: "dead-zone" },
  { n: 22, title: "Cold Snap", tasks: 5, tokens: [">", ">>", ">>>", ">>>>"] },
  {
    n: 23,
    title: "Callisto",
    tasks: 5,
    tokens: ["1", "2", "3", "4", "5"],
    rule: "Before choosing tasks, you may swap the places of two task tokens.",
  },
  { n: 24, title: "The Captain's Plan", tasks: 6, captainDeals: "each" },
  {
    n: 25,
    title: "Rings of Saturn",
    tasks: 6,
    tokens: [">", ">>"],
    comms: "dead-zone",
    fivePlayerRule: true,
    rule: "From now on, five players use the five-player rule.",
  },
  {
    n: 26,
    title: "Hull Breach",
    tasks: null,
    rule: "Two 1s must each win a trick.",
  },
  { n: 27, title: "Flux Compensator", tasks: 3, captainDeals: "one", fivePlayerRule: true },
  {
    n: 28,
    title: "Cosmic Radiation",
    tasks: 6,
    tokens: ["1", "Ω"],
    comms: "from-trick-3",
    fivePlayerRule: true,
  },
  {
    n: 29,
    title: "Even Shares",
    tasks: null,
    comms: "dead-zone",
    rule: RANKING,
  },
  {
    n: 30,
    title: "Uranus",
    tasks: 6,
    tokens: [">", ">>", ">>>"],
    comms: "from-trick-2",
    fivePlayerRule: true,
  },
  { n: 31, title: "Moons of Uranus", tasks: 6, tokens: ["1", "2", "3"], fivePlayerRule: true },
  { n: 32, title: "Frayed Nerves", tasks: 7, captainDeals: "each", fivePlayerRule: true },
  {
    n: 33,
    title: "Spacewalk",
    tasks: null,
    rule: "The captain asks each only “yes” or “no”, then picks one crew member, who must win exactly 1 trick — not with a rocket.",
  },
  {
    n: 34,
    title: "Gravity Module",
    tasks: null,
    rule: `${RANKING} The captain must win the first and the last trick.`,
  },
  { n: 35, title: "Neptune", tasks: 7, tokens: [">", ">>", ">>>"], fivePlayerRule: true },
  {
    n: 36,
    title: "A Quiet Moment",
    tasks: 7,
    tokens: ["1", "2"],
    captainDeals: "each",
    fivePlayerRule: true,
  },
  { n: 37, title: "Pluto", tasks: 4, captainDeals: "one", fivePlayerRule: true },
  { n: 38, title: "Heliopause", tasks: 8, comms: "from-trick-3", fivePlayerRule: true },
  {
    n: 39,
    title: "Giant Objects",
    tasks: 8,
    tokens: [">", ">>", ">>>"],
    comms: "dead-zone",
    fivePlayerRule: true,
  },
  {
    n: 40,
    title: "Planet Nine",
    tasks: 8,
    tokens: ["1", "2", "3"],
    fivePlayerRule: true,
    rule: "Before choosing tasks, you may move one task token onto a task without one.",
  },
  {
    n: 41,
    title: "Landing Prep",
    tasks: null,
    rule: "The captain asks each only “yes” or “no”, then picks one crew member, who must win only the first and the last trick — neither with a rocket.",
  },
  { n: 42, title: "The Anomaly", tasks: 9, fivePlayerRule: true },
  { n: 43, title: "Wormhole", tasks: 9, captainDeals: "each", fivePlayerRule: true },
  {
    n: 44,
    title: "Jump Prep",
    tasks: null,
    rule: "Every rocket must win a trick: the 1 first, then the 2, the 3 and last the 4.",
  },
  {
    n: 45,
    title: "Inside the Wormhole",
    tasks: 9,
    tokens: [">", ">>", ">>>"],
    fivePlayerRule: true,
  },
  {
    n: 46,
    title: "Red Alert",
    tasks: null,
    rule: "The crew member left of whoever holds the pink 9 must win every pink card; its holder says who they are.",
  },
  { n: 47, title: "Ten Seconds", tasks: 10, fivePlayerRule: true },
  {
    n: 48,
    title: "Heat Shields",
    tasks: 3,
    tokens: ["Ω"],
    fivePlayerRule: true,
    rule: "The Ω task must be won in the very last trick.",
  },
  {
    n: 49,
    title: "Orbit of Venus",
    tasks: 10,
    tokens: [">", ">>", ">>>"],
    fivePlayerRule: true,
  },
  {
    n: 50,
    title: "Homeward",
    tasks: null,
    rule: "One crew member must win the first 4 tricks, another the last trick, and the rest every trick between; the captain asks each for their preferred role, then the crew decides together without revealing hands.",
  },
];

/** The stored scenario for a mission ("#12 Papers Everywhere"). */
export function planetNineScenario(m: LogbookMission): string {
  return `#${m.n} ${m.title}`;
}

export function planetNineMission(n: number): LogbookMission | null {
  return PLANET_NINE_LOGBOOK[n - 1]?.n === n ? (PLANET_NINE_LOGBOOK[n - 1] ?? null) : null;
}
