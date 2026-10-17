/**
 * The trainer's folders, fixed in code: each folder is a position (the moves
 * from the start) with a name, and holds the folders for the replies worth
 * their own. Clicking one puts its position on the board.
 *
 * Naming convention, for every folder at every depth:
 *
 *   "<move> <name>"   e.g. `1…c5 Sicilian`, then inside it `2.c3 Alapin`
 *
 *   - <move>: the move that reaches the folder, with its number — `1.e4` for
 *     White, `1…c5` for Black (an ellipsis, no space).
 *   - <name>: the opening's name from the lichess opening list
 *     (github.com/lichess-org/chess-openings) for exactly that position,
 *     shortened to what tells it apart: the family name for a first reply
 *     ("Sicilian Defense" → `Sicilian`), the variation's own word deeper down
 *     ("Sicilian Defense: Alapin Variation" → `Alapin`). Drop "Defense",
 *     "Opening", "Game" and "Variation"; keep "Gambit", "Attack", "System".
 *   - No name in the list for that exact position:
 *       1. look further — the web and the literature (books, Wikipedia, ECO
 *          indexes) for a lesser-known name;
 *       2. if nothing exists, COIN one the trainee can attach a memory to: the
 *          strongest player who played it in the biggest event, or whoever
 *          played it most at the top, a trap it leads to, or what the
 *          literature says about the position. A coined name carries a `note`
 *          saying where it comes from (shown as the folder's tooltip).
 *   - At most ~20 characters; no repeating the parent's name.
 *
 *   - Coined names follow patterns that build on names you already know:
 *       "Late <name>" — a first-move defence's pawn move played a move later
 *       (2…h6 is a late Carr, 1…h6); a famous nickname for the same idea
 *       (Bongcloud for an early king walk); or what the move does (Queen
 *       Drop, when it simply hangs the queen).
 *
 * Your own move is a folder of its own (`1.e4 King's Pawn`, `2.Nf3 King's
 * Knight`), named like any other, holding a folder for every reply played
 * against it.
 *
 * Transpositions: each of your games belongs to exactly one folder — the most
 * specific folder position it reaches, by any move order — and a folder's
 * count is its own games plus its subfolders'. A game reaching a folder by
 * another move order counts there, as a transposition. The trainer shows folders by how many of
 * your games they hold, largest first, and hides the ones with none.
 */

export interface TrainerFolder {
  readonly id: string;
  readonly name: string;
  /** Where a looked-up or coined name comes from. */
  readonly note?: string;
  /** UCI moves from the start position to this folder's position. */
  readonly moves: readonly string[];
  readonly children: readonly TrainerFolder[];
}

const folder = (
  name: string,
  moves: readonly string[],
  children: readonly TrainerFolder[] = [],
  note?: string,
): TrainerFolder => ({
  id: moves.join("-") || "start",
  name,
  moves,
  children,
  ...(note ? { note } : {}),
});

/** Black's first replies to 1.e4: move, short name, and where an unlisted name comes from. */
const E4_REPLIES: readonly [uci: string, name: string, note?: string][] = [
  ["c7c5", "1…c5 Sicilian"],
  [
    "e7e5",
    "1…e5 Open Game",
    "Named from the literature: lichess calls 1.e4 e5 the King's Pawn Game, the same as 1.e4 itself, so it takes its standard book name — the Open Game.",
  ],
  ["e7e6", "1…e6 French"],
  ["c7c6", "1…c6 Caro-Kann"],
  ["d7d5", "1…d5 Scandinavian"],
  ["d7d6", "1…d6 Pirc"],
  ["g7g6", "1…g6 Modern"],
  ["g8f6", "1…Nf6 Alekhine"],
  ["b8c6", "1…Nc6 Nimzowitsch"],
  ["b7b6", "1…b6 Owen"],
  ["a7a6", "1…a6 St. George"],
  ["f7f5", "1…f5 Duras Gambit"],
  [
    "b7b5",
    "1…b5 Pawn Gift",
    "Coined: no opening list, book or index names 1.e4 b5. It gives the b-pawn away on move one — 2.Bxb5 simply takes it. (Its cousin 1.d4 b5 is the Polish Defense, which Spassky tried against Petrosian in their 1966 title match.)",
  ],
  ["f7f6", "1…f6 Barnes"],
  ["g7g5", "1…g5 Borg"],
  ["h7h6", "1…h6 Carr"],
  ["a7a5", "1…a5 Ware"],
  ["h7h5", "1…h5 Goldsmith"],
  ["b8a6", "1…Na6 Lemming"],
  ["g8h6", "1…Nh6 Hippopotamus"],
];

/** Black's replies to 1.e4 e5 2.Nf3 that your games met. */
const NF3_REPLIES: readonly [uci: string, name: string, note?: string][] = [
  ["b8c6", "2…Nc6 Normal"],
  ["g8f6", "2…Nf6 Petrov"],
  ["d7d6", "2…d6 Philidor"],
  ["f8c5", "2…Bc5 Busch-Gass Gambit"],
  ["d7d5", "2…d5 Elephant Gambit"],
  ["d8f6", "2…Qf6 McConnell"],
  ["f7f5", "2…f5 Latvian Gambit"],
  ["f7f6", "2…f6 Damiano"],
  ["c7c6", "2…c6 Gunderam Gambit"],
  ["d8e7", "2…Qe7 Gunderam"],
  [
    "f8d6",
    "2…Bd6 Self-Block",
    "Coined: no opening list or book names it. The bishop stands in front of Black's own d-pawn, so the c8 bishop has no way out until it moves again.",
  ],
  [
    "f8b4",
    "2…Bb4 Pin to Nowhere",
    "Coined: no name found. The bishop goes where it would pin a knight on c3 — but no knight stands there yet.",
  ],
  [
    "h7h6",
    "2…h6 Late Carr",
    "Coined: no name found. 1…h6 is the Carr Defence; this is its move, one move late.",
  ],
  [
    "a7a5",
    "2…a5 Late Ware",
    "Coined: no name found. 1…a5 is the Ware Defence; this is its move, one move late.",
  ],
  [
    "b7b5",
    "2…b5 Late Pawn Gift",
    "Coined: no name found. Like 1…b5 (the Pawn Gift), the pawn hangs: the f1 bishop takes it.",
  ],
  [
    "b7b6",
    "2…b6 Late Owen",
    "Coined: no name found. 1…b6 is Owen's Defence; this is its fianchetto, one move late.",
  ],
  [
    "c7c5",
    "2…c5 Late Sicilian",
    "Coined: no name found. 1…c5 is the Sicilian; next to …e5 it leaves a hole on d5.",
  ],
  [
    "d8h4",
    "2…Qh4 Queen Drop",
    "Coined: no name found. The knight on f3 simply takes the queen: 3.Nxh4.",
  ],
  [
    "e8e7",
    "2…Ke7 Bongcloud",
    "Coined from a famous nickname: the Bongcloud is an early king walk (1.e4 e5 2.Ke2), played for fun even by Carlsen and Nakamura. Here it is Black's king.",
  ],
  [
    "g7g6",
    "2…g6 Late Modern",
    "Coined: no name found. 1…g6 is the Modern Defence; this is its fianchetto behind …e5.",
  ],
];

type Reply = readonly [uci: string, name: string, note?: string];

const LATE = (first: string, name: string, late = "one move") =>
  `Coined: no name found. 1…${first} is the ${name}; this is its move, ${late} late.`;
const LATE2 = (first: string, name: string) => LATE(first, name, "two moves");
const MAIN = "The book main line here (lichess names it after the opening itself).";

/**
 * Your second move against each first reply (set in the trainer, fixed here),
 * with every reply your games met after it. Four replies are the same position
 * reached by another move order (French 2…c6 = Caro-Kann 2…e6, French 2…d6 =
 * Pirc 2…e6, Pirc 2…g6 = Modern 2…d6, Caro-Kann 2…d6 = Pirc 2…c6): they share
 * a name, and the games belong to the first of them (the other stays empty).
 */
const SECOND_MOVES: readonly {
  reply: string;
  pick: string;
  name: string;
  note?: string;
  replies: readonly Reply[];
}[] = [
  {
    reply: "c7c5",
    pick: "c2c3",
    name: "2.c3 Alapin",
    replies: [
      [
        "b8c6",
        "2…Nc6 Flexible Knight",
        "Coined: no list names it. Black develops before choosing between …d5 and …Nf6, and often transposes into either.",
      ],
      [
        "d7d6",
        "2…d6 Small Center",
        "Coined from the Small Center Defense: the same modest pawn front (…d6) against White's centre.",
      ],
      [
        "d7d5",
        "2…d5 Barmen",
        "Named after its main line: lichess calls 2…d5 3.exd5 Qxd5 the Barmen Defense.",
      ],
      ["e7e6", "2…e6 French", "Named after where it usually goes: 3.d4 d5 is a French Defence."],
      ["g8f6", "2…Nf6 Main Line", "The books' main answer to the Alapin (2…Nf6 3.e5 Nd5)."],
      [
        "e7e5",
        "2…e5 Botvinnik Wall",
        "Coined: …c5 with …e5 is the Botvinnik pawn setup, here against the Alapin.",
      ],
      [
        "g7g6",
        "2…g6 Dragon Setup",
        "Coined: the Dragon's fianchetto (…g6, …Bg7) against the Alapin.",
      ],
      [
        "a7a6",
        "2…a6 O'Kelly",
        "Named after the O'Kelly Variation (1.e4 c5 2.Nf3 a6): the same early …a6.",
      ],
      [
        "b7b6",
        "2…b6 Katalimov",
        "Named after the Katalimov Variation (1.e4 c5 2.Nf3 b6): the same queen-side fianchetto.",
      ],
      ["f7f5", "2…f5 Late Duras", LATE("f5", "Duras Gambit")],
      ["h7h6", "2…h6 Late Carr", LATE("h6", "Carr Defence")],
    ],
  },
  {
    reply: "e7e6",
    pick: "d2d4",
    name: "2.d4 Normal",
    replies: [
      ["d7d5", "2…d5 Main Line", MAIN],
      ["c7c5", "2…c5 Franco-Sicilian"],
      ["b7b6", "2…b6 Late Owen", LATE("b6", "Owen Defence")],
      [
        "c7c6",
        "2…c6 Franco-Caro",
        "Coined: …e6 with …c6 mixes the French and the Caro-Kann (…d5 next is a Caro-Kann). Same position as Caro-Kann 2…e6.",
      ],
      [
        "d7d6",
        "2…d6 Small Center",
        "lichess: Rat Defense, Small Center Defense (…e6 and …d6 against e4–d4). Same position as Pirc 2…e6.",
      ],
      [
        "f8b4",
        "2…Bb4+ Early Check",
        "Coined: no name found. The bishop checks at once — 3.c3 or 3.Bd2 answers it.",
      ],
      [
        "g8e7",
        "2…Ne7 Shy Knight",
        "Coined: no name found. The knight goes to e7, not f6, keeping the f-pawn free.",
      ],
      ["a7a6", "2…a6 St. George"],
      [
        "b8c6",
        "2…Nc6 Queen's Knight",
        "Coined: no name found. The queen's knight before …d5, Nimzowitsch-style.",
      ],
      ["g8f6", "2…Nf6 Mediterranean"],
      [
        "f8e7",
        "2…Be7 Bishop First",
        "Coined: no name found. The bishop develops before any pawn or knight decides the structure.",
      ],
      ["h7h6", "2…h6 Late Carr", LATE("h6", "Carr Defence")],
      [
        "d8f6",
        "2…Qf6 Early Queen",
        "Coined: no name found. The queen comes out on move two, like the McConnell (2…Qf6 against 2.Nf3).",
      ],
      ["f7f5", "2…f5 Franco-Hiva Gambit"],
      ["f7f6", "2…f6 Late Barnes", LATE("f6", "Barnes Defence")],
      ["g7g6", "2…g6 Late Modern", LATE("g6", "Modern Defence")],
    ],
  },
  {
    reply: "d7d5",
    pick: "e4d5",
    name: "2.exd5 Main Line",
    note: "The book main line: White takes the pawn (lichess names it after the opening itself).",
    replies: [
      ["d8d5", "2…Qxd5 Mieses-Kotroc"],
      ["g8f6", "2…Nf6 Modern"],
      [
        "c7c6",
        "2…c6 Kloosterboer Gambit",
        "lichess: the Blackburne–Kloosterboer Gambit — shortened.",
      ],
      [
        "e7e6",
        "2…e6 French Gambit",
        "Coined: no name found. …e6 gives the pawn back French-style (3.dxe6 Bxe6).",
      ],
      [
        "e7e5",
        "2…e5 Boehnke Gambit",
        "Named after its main line: lichess calls 2…e5 3.dxe6 Bxe6 the Boehnke Gambit.",
      ],
      ["c7c5", "2…c5 Late Sicilian", LATE("c5", "Sicilian")],
      [
        "c8f5",
        "2…Bf5 Bishop Gambit",
        "Coined: no name found. The bishop develops and leaves the pawn on d5 for now.",
      ],
      [
        "d8d6",
        "2…Qd6 Slow Queen",
        "Coined: no name found. The queen steps to d6 first and takes on d5 later.",
      ],
      [
        "b8c6",
        "2…Nc6 Knight Gambit",
        "Coined: no name found. The knight develops, the pawn on d5 left for later.",
      ],
      ["h7h5", "2…h5 Late Goldsmith", LATE("h5", "Goldsmith Defence")],
    ],
  },
  {
    reply: "c7c6",
    pick: "d2d4",
    name: "2.d4 Normal",
    replies: [
      ["d7d5", "2…d5 Main Line", MAIN],
      [
        "d7d6",
        "2…d6 Czech",
        "Named after the Czech Pirc (…d6 with …c6). Same position as Pirc 2…c6.",
      ],
      [
        "e7e6",
        "2…e6 Franco-Caro",
        "Coined: …c6 with …e6 mixes the Caro-Kann and the French. Same position as French 2…c6.",
      ],
      [
        "g7g6",
        "2…g6 Gurgenidze",
        "Named after the Gurgenidze (…c6 and …g6, then …d5) — lichess has the Accelerated Gurgenidze.",
      ],
      ["b7b6", "2…b6 Late Owen", LATE("b6", "Owen Defence")],
      ["d8c7", "2…Qc7 Early Queen", "Coined: no name found. The queen comes out on move two."],
      ["h7h6", "2…h6 Late Carr", LATE("h6", "Carr Defence")],
    ],
  },
  {
    reply: "d7d6",
    pick: "d2d4",
    name: "2.d4 Normal",
    replies: [
      ["g8f6", "2…Nf6 Main Line", MAIN],
      [
        "g7g6",
        "2…g6 Pirc-Modern",
        "The Pirc/Modern crossroads (…d6 and …g6). Same position as Modern 2…d6.",
      ],
      [
        "e7e6",
        "2…e6 Small Center",
        "lichess: Rat Defense, Small Center Defense. Same position as French 2…d6.",
      ],
      [
        "c7c6",
        "2…c6 Czech",
        "Named after the Czech Pirc (…d6 with …c6). Same position as Caro-Kann 2…d6.",
      ],
      ["e7e5", "2…e5 Maróczy"],
      ["b8c6", "2…Nc6 Mikenas"],
      ["b8d7", "2…Nd7 Antal"],
      ["c7c5", "2…c5 Late Sicilian", LATE("c5", "Sicilian")],
      ["f7f5", "2…f5 Balogh"],
      ["g7g5", "2…g5 Late Borg", LATE("g5", "Borg Defence")],
      ["h7h6", "2…h6 Late Carr", LATE("h6", "Carr Defence")],
    ],
  },
  {
    reply: "g7g6",
    pick: "d2d4",
    name: "2.d4 Normal",
    replies: [
      ["f8g7", "2…Bg7 Main Line", MAIN],
      [
        "d7d6",
        "2…d6 Pirc-Modern",
        "The Pirc/Modern crossroads (…g6 and …d6). Same position as Pirc 2…g6.",
      ],
      ["e7e5", "2…e5 Pawn Offer", "Coined: no name found. …e5 offers a pawn at once: 3.dxe5."],
      ["e7e6", "2…e6 Hippo Setup", "Coined: …g6 with …e6 is how the Hippopotamus setup begins."],
      ["g8f6", "2…Nf6 Norwegian"],
    ],
  },
];

/**
 * Your third move where the folders go one level deeper (the position before it
 * as moves from the start), with every reply your games met after it.
 */
const THIRD_MOVES: readonly {
  at: readonly string[];
  pick: string;
  name: string;
  replies: readonly Reply[];
}[] = [
  {
    at: ["e2e4", "c7c6", "d2d4", "d7d5"],
    pick: "e4e5",
    name: "3.e5 Advance",
    replies: [
      ["c8f5", "3…Bf5 Main Line", MAIN],
      ["c6c5", "3…c5 Botvinnik-Carls"],
      [
        "e7e6",
        "3…e6 Slow French",
        "Coined: no name found. The French Advance's pawn chain (…e6 behind …d5), with …c6 where the French plays …c5: one tempo slower against the centre.",
      ],
      [
        "f7f6",
        "3…f6 Pawn Strike",
        "Coined: no name found. …f6 hits the e5 pawn at once, before the c8 bishop is out.",
      ],
      [
        "d8b6",
        "3…Qb6 Early Queen",
        "Coined: no name found. The queen comes out before the bishop, eyeing d4 and b2.",
      ],
      [
        "h7h6",
        "3…h6 Late Carr",
        "Coined: no name found. 1…h6 is the Carr Defence; here it comes two moves late. The same position as 2…h6 Late Carr 3.e5 d5.",
      ],
    ],
  },
  {
    at: ["e2e4", "e7e5", "g1f3", "b8c6"],
    pick: "f1b5",
    name: "3.Bb5 Ruy Lopez",
    replies: [
      ["a7a6", "3…a6 Morphy"],
      ["d7d6", "3…d6 Steinitz"],
      ["g8f6", "3…Nf6 Berlin"],
      ["f8c5", "3…Bc5 Classical"],
      ["c6d4", "3…Nd4 Bird"],
      ["g8e7", "3…Nge7 Cozio"],
      [
        "d8f6",
        "3…Qf6 Early Queen",
        "Coined: no name found. The queen comes out to guard e5 and eye f2 before a minor piece is developed.",
      ],
      ["f7f5", "3…f5 Schliemann"],
      ["f7f6", "3…f6 Nürnberg"],
      [
        "f8d6",
        "3…Bd6 Blocked Bishop",
        "Coined: no name found. The bishop guards e5 but stands in front of the d-pawn, shutting in the c8 bishop.",
      ],
      ["f8b4", "3…Bb4 Alapin"],
      ["h7h6", "3…h6 Late Carr", LATE2("h6", "Carr Defence")],
      [
        "c6e7",
        "3…Nce7 Knight Back",
        "Coined: no name found. The c6 knight steps back to e7, heading for g6 — the Cozio's square, reached by the other knight.",
      ],
      ["f8e7", "3…Be7 Lucena"],
      ["c6b8", "3…Nb8 Retreat"],
      ["d7d5", "3…d5 Countergambit", "lichess: Ruy Lopez: Spanish Countergambit."],
      ["d8e7", "3…Qe7 Vinogradov"],
      ["g7g6", "3…g6 Fianchetto"],
      ["a7a5", "3…a5 Bulgarian"],
      ["g7g5", "3…g5 Brentano Gambit"],
    ],
  },
  {
    at: ["e2e4", "e7e5", "g1f3", "g8f6"],
    pick: "f3e5",
    name: "3.Nxe5 Main Line",
    replies: [
      ["b8c6", "3…Nc6 Stafford Gambit"],
      ["d7d6", "3…d6 Main Line", MAIN],
      ["f6e4", "3…Nxe4 Damiano"],
      [
        "d8e7",
        "3…Qe7 Early Queen",
        "Coined: no name found. The queen hits e5 at once; after 4.Nf3 Qxe4+ the queens usually come off early.",
      ],
      [
        "d7d5",
        "3…d5 Centre Strike",
        "Coined: no name found. Black gives up e5 and strikes at e4 straight away instead of chasing the knight.",
      ],
      [
        "f8c5",
        "3…Bc5 Bishop Gambit",
        "Coined: no name found. Black lets the e5 pawn go and aims the bishop at f2, Italian-style.",
      ],
      ["c7c6", "3…c6 Late Caro", LATE2("c6", "Caro-Kann Defence")],
      [
        "f8d6",
        "3…Bd6 Blocked Bishop",
        "Coined: no name found. The bishop hits the e5 knight but stands in front of the d-pawn, shutting in the c8 bishop.",
      ],
      [
        "f8e7",
        "3…Be7 Quiet Bishop",
        "Coined: no name found. Black simply develops a pawn down, without trying to win e5 back.",
      ],
      ["h7h5", "3…h5 Late Goldsmith", LATE2("h5", "Goldsmith Defence")],
    ],
  },
  {
    at: ["e2e4", "e7e5", "g1f3", "d7d6"],
    pick: "d2d4",
    name: "3.d4 Main Line",
    replies: [
      ["e5d4", "3…exd4 Exchange"],
      [
        "c8g4",
        "3…Bg4 Albin-Blackburne",
        "lichess names it after its gambit line, Philidor Defense: Albin-Blackburne Gambit (4.dxe5 Nd7).",
      ],
      [
        "b8c6",
        "3…Nc6 Knight Guard",
        "Coined: no name found. The knight holds e5 a second time, keeping the pawn instead of taking on d4.",
      ],
      ["f7f6", "3…f6 Late Barnes", LATE2("f6", "Barnes Defence")],
      ["b8d7", "3…Nd7 Hanham"],
      ["g8f6", "3…Nf6 Nimzowitsch"],
      [
        "d8e7",
        "3…Qe7 Queen Guard",
        "Coined: no name found. The queen holds e5 instead of a knight, blocking the f8 bishop.",
      ],
      ["h7h6", "3…h6 Late Carr", LATE2("h6", "Carr Defence")],
      ["c7c6", "3…c6 Late Caro", LATE2("c6", "Caro-Kann Defence")],
      [
        "f8e7",
        "3…Be7 Quiet Bishop",
        "Coined: no name found. Black develops behind the pawns and lets White choose how to open the centre.",
      ],
      [
        "c8e6",
        "3…Be6 Early Bishop",
        "Coined: no name found. The light bishop comes out before the knights, covering d5 and c4.",
      ],
      [
        "d8f6",
        "3…Qf6 Early Queen",
        "Coined: no name found. The queen holds e5 from f6, taking the knight's best square.",
      ],
      ["g7g6", "3…g6 Late Modern", LATE2("g6", "Modern Defence")],
      ["c7c5", "3…c5 Late Sicilian", LATE2("c5", "Sicilian Defence")],
      ["f7f5", "3…f5 Countergambit", "lichess: Philidor Defense: Philidor Countergambit."],
    ],
  },
];

const deeper = (moves: readonly string[]): TrainerFolder[] =>
  THIRD_MOVES.filter((t) => t.at.join(" ") === moves.join(" ")).map((t) =>
    folder(
      t.name,
      [...moves, t.pick],
      t.replies.map(([reply, name, note]) => folder(name, [...moves, t.pick, reply], [], note)),
    ),
  );

/**
 * The folders the analysis farm works on (their positions and everything
 * below). Positions elsewhere in the tree wait: the trainer only asks the farm
 * about these, and the farm's own follow-ups stay below them.
 */
export const FARM_FOCUS: Readonly<Record<"w" | "b", readonly (readonly string[])[]>> = {
  w: [
    ["e2e4", "c7c6", "d2d4"],
    ["e2e4", "e7e5", "g1f3", "f7f6"],
    ["e2e4", "g7g6"],
    ["e2e4", "b7b6"],
    ["e2e4", "b8c6"],
    ["e2e4", "g8f6"],
    ["e2e4", "a7a6"],
    ["e2e4", "h7h5"],
    ["e2e4", "h7h6"],
    ["e2e4", "a7a5"],
    ["e2e4", "f7f5"],
    ["e2e4", "b7b5"],
    ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"],
    ["e2e4", "e7e5", "g1f3", "g8f6", "f3e5"],
    ["e2e4", "e7e5", "g1f3", "d7d6", "d2d4"],
  ],
  b: [],
};

/** Your moves fixed by hand, applied to the tree: position (moves from the start) → your move. */
export const FIXED_CHOICES: Readonly<
  Record<"w" | "b", readonly { moves: readonly string[]; uci: string }[]>
> = {
  w: [
    { moves: [], uci: "e2e4" },
    { moves: ["e2e4", "e7e5"], uci: "g1f3" },
  ],
  b: [],
};

export const TRAINER_FOLDERS: Readonly<Record<"w" | "b", readonly TrainerFolder[]>> = {
  w: [
    folder(
      "1.e4 King's Pawn",
      ["e2e4"],
      E4_REPLIES.map(([uci, name, note]) =>
        folder(
          name,
          ["e2e4", uci],
          uci === "e7e5"
            ? [
                folder(
                  "2.Nf3 King's Knight",
                  ["e2e4", "e7e5", "g1f3"],
                  NF3_REPLIES.map(([reply, replyName, replyNote]) =>
                    folder(
                      replyName,
                      ["e2e4", "e7e5", "g1f3", reply],
                      deeper(["e2e4", "e7e5", "g1f3", reply]),
                      replyNote,
                    ),
                  ),
                ),
              ]
            : SECOND_MOVES.filter((m) => m.reply === uci).map((m) =>
                folder(
                  m.name,
                  ["e2e4", uci, m.pick],
                  m.replies.map(([reply, replyName, replyNote]) =>
                    folder(
                      replyName,
                      ["e2e4", uci, m.pick, reply],
                      deeper(["e2e4", uci, m.pick, reply]),
                      replyNote,
                    ),
                  ),
                  m.note,
                ),
              ),
          note,
        ),
      ),
    ),
  ],
  b: [],
};
