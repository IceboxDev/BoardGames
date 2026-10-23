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
 * Your move where the folders go one level deeper (the position before it as
 * moves from the start), with every reply your games met after it. From the
 * third move on; a reply's folder goes deeper again when an entry starts there.
 */
const THIRD_MOVES: readonly {
  at: readonly string[];
  pick: string;
  name: string;
  note?: string;
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
    at: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "d7d6"],
    pick: "d2d4",
    name: "4.d4 Main Line",
    note: "Named from the literature: 4.d4 is the book answer to the Steinitz Defence, striking at e5 at once. lichess files the position under the Steinitz Defense itself.",
    replies: [
      [
        "e5d4",
        "4…exd4 Exchange",
        "Coined: no name found. Black gives up the centre at once, as in the Philidor's 3…exd4 Exchange.",
      ],
      [
        "c8d7",
        "4…Bd7 Strongpoint",
        "Coined: no name found. Black unpins and keeps the pawn on e5, the classical way to hold the centre in the Steinitz.",
      ],
      [
        "a7a6",
        "4…a6 Late Morphy",
        "Coined: no name found. 3…a6 is the Morphy Defence; here it comes a move later, after …d6 and 4.d4.",
      ],
      [
        "c8g4",
        "4…Bg4 Counter-Pin",
        "Coined: no name found. Black answers the pin on c6 by pinning the f3 knight in turn.",
      ],
    ],
  },
  {
    at: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6"],
    pick: "b5a4",
    name: "4.Ba4 Retreat",
    note: "Named from the literature: the bishop steps back to a4 and keeps the pin on the c6 knight alive; with 4.Bxc6 (the Exchange) the other main choice.",
    replies: [
      [
        "g8f6",
        "4…Nf6 Main Line",
        "Named from the literature: lichess lists no name for this exact position; 4…Nf6 is the book main line of the Morphy Defence, heading for the Closed and Open Ruy.",
      ],
      ["b7b5", "4…b5 Caro", "lichess: Ruy Lopez: Morphy Defense, Caro Variation."],
      ["d7d6", "4…d6 Modern Steinitz"],
      ["f8c5", "4…Bc5 Classical Deferred"],
      [
        "f8e7",
        "4…Be7 Quiet Bishop",
        "Coined: no name found. The bishop develops modestly to e7 before the knight comes to f6.",
      ],
      [
        "f8d6",
        "4…Bd6 Late Self-Block",
        "Coined: no name found. As 2…Bd6 Self-Block, the bishop stands in front of the d-pawn, here two moves later.",
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
      t.replies.map(([reply, name, note]) =>
        folder(name, [...moves, t.pick, reply], deeper([...moves, t.pick, reply]), note),
      ),
      t.note,
    ),
  );

/**
 * The folders the analysis farm works on (their positions and everything
 * below). Since 2026-10-20 that is the whole tree for both colours: every
 * position of yours waiting for an evaluation is queued, so nothing stays
 * "not queued". Kept as a list so a colour can be narrowed again.
 */
export const FARM_FOCUS: Readonly<Record<"w" | "b", readonly (readonly string[])[]>> = {
  w: [[]],
  b: [[]],
};

/** Your moves fixed by hand, applied to the tree: position (moves from the start) → your move. */
export const FIXED_CHOICES: Readonly<
  Record<"w" | "b", readonly { moves: readonly string[]; uci: string }[]>
> = {
  w: [
    { moves: [], uci: "e2e4" },
    { moves: ["e2e4", "e7e5"], uci: "g1f3" },
    // Your moves into the folders the farm started with (Caro-Kann, Ruy Lopez,
    // Petrov, Philidor): fixed, so widening the farm never hands them to the engine.
    { moves: ["e2e4", "c7c6"], uci: "d2d4" },
    { moves: ["e2e4", "e7e5", "g1f3", "b8c6"], uci: "f1b5" },
    { moves: ["e2e4", "e7e5", "g1f3", "g8f6"], uci: "f3e5" },
    { moves: ["e2e4", "e7e5", "g1f3", "d7d6"], uci: "d2d4" },
  ],
  b: [],
};

/**
 * Every move of yours the tree takes as given: `FIXED_CHOICES`, plus your
 * moves on the way into each of the farm's folders (`FARM_FOCUS`). Those
 * folders are named for your move into them ("3.Bb5 Ruy Lopez"), so it is
 * your repertoire; and the position before it lies outside every focus folder,
 * so the farm would never be asked about it and the tree could never grow
 * into the folder.
 */
export function fixedChoices(
  color: "w" | "b",
): readonly { moves: readonly string[]; uci: string }[] {
  const out = [...FIXED_CHOICES[color]];
  const yours = color === "w" ? 0 : 1;
  for (const root of FARM_FOCUS[color]) {
    root.forEach((uci, ply) => {
      if (ply % 2 !== yours) return;
      const moves = root.slice(0, ply);
      if (!out.some((o) => o.moves.join(" ") === moves.join(" "))) out.push({ moves, uci });
    });
  }
  return out;
}

/** White's first moves, as Black meets them: move, folder name (lichess list, shortened). */
const WHITE_FIRST_MOVES: readonly [uci: string, name: string][] = [
  ["e2e4", "1.e4 King's Pawn"],
  ["d2d4", "1.d4 Queen's Pawn"],
  ["c2c4", "1.c4 English"],
  ["g1f3", "1.Nf3 Zukertort"],
  ["e2e3", "1.e3 Van't Kruijs"],
  ["g2g3", "1.g3 Hungarian"],
  ["f2f4", "1.f4 Bird"],
  ["b2b3", "1.b3 Nimzo-Larsen Attack"],
  ["d2d3", "1.d3 Mieses"],
  ["b1c3", "1.Nc3 Van Geet"],
  ["b2b4", "1.b4 Polish"],
  ["g2g4", "1.g4 Grob"],
  ["c2c3", "1.c3 Saragossa"],
  ["h2h4", "1.h4 Kádas"],
  ["h2h3", "1.h3 Clemenz"],
  ["a2a4", "1.a4 Ware"],
  ["f2f3", "1.f3 Barnes"],
  ["a2a3", "1.a3 Anderssen"],
  ["g1h3", "1.Nh3 Amar"],
  ["b1a3", "1.Na3 Sodium Attack"],
];

/**
 * Black's own replies to a first move, as folders (your move into them), each
 * holding White's second moves your games met (5 games or more).
 */
const BLACK_REPLIES: Readonly<
  Record<string, { pick: string; name: string; note?: string; replies: readonly Reply[] }>
> = {
  e2e4: {
    pick: "e7e6",
    name: "1…e6 French",
    replies: [
      ["d2d4", "2.d4 Normal"],
      ["g1f3", "2.Nf3 Knight"],
      ["b1c3", "2.Nc3 Queen's Knight"],
      ["f2f4", "2.f4 La Bourdonnais"],
      [
        "f1c4",
        "2.Bc4 Bishop's Opening",
        "Coined: no name in the lichess list. The bishop goes to c4 as in the Bishop's Opening (1.e4 e5 2.Bc4), here against 1…e6, where …d5 hits it at once.",
      ],
      ["c2c4", "2.c4 Steiner"],
      ["e4e5", "2.e5 Steinitz Attack"],
      ["d2d3", "2.d3 King's Indian Attack"],
      [
        "d1f3",
        "2.Qf3 Early Queen",
        "Coined: no name found. The queen comes out before any minor piece, eyeing f7 and b7.",
      ],
      [
        "c2c3",
        "2.c3 Late Saragossa",
        "Coined: no name found. 1.c3 is the Saragossa Opening; here White plays it a move later.",
      ],
      ["b2b3", "2.b3 Horwitz Attack"],
      ["g2g3", "2.g3 Réti-Spielmann"],
      [
        "d1h5",
        "2.Qh5 Parham",
        "Coined: no name in the lichess list for this position. The same queen sortie as the Parham Attack (1.e4 e5 2.Qh5), here against 1…e6.",
      ],
      ["d1e2", "2.Qe2 Chigorin"],
    ],
  },
  d2d4: {
    pick: "e7e6",
    name: "1…e6 Horwitz",
    replies: [
      [
        "c2c4",
        "2.c4 Normal",
        "Named by analogy: lichess calls 1.d4 Nf6 2.c4 the Normal Variation; 2.c4 is the main line here too, mostly heading for the Queen's Gambit Declined or the Nimzo-Indian.",
      ],
      [
        "c1f4",
        "2.Bf4 Accelerated London",
        "Named by analogy: lichess calls 1.d4 d5 2.Bf4 the Accelerated London System, the same early bishop.",
      ],
      [
        "e2e4",
        "2.e4 French",
        "A transposition: the French Defense, Normal Variation (1.e4 e6 2.d4).",
      ],
      [
        "g1f3",
        "2.Nf3 Zukertort",
        "Named by analogy: lichess calls 1.d4 d5 2.Nf3 the Zukertort Variation.",
      ],
      [
        "e2e3",
        "2.e3 Colle Setup",
        "Coined: no name found. d4 and e3 are the Colle System's pawns; the full system follows with Nf3 and Bd3.",
      ],
      [
        "b1c3",
        "2.Nc3 Chigorin",
        "Named by analogy: lichess calls 1.d4 d5 2.Nc3 the Chigorin Variation.",
      ],
      [
        "g2g3",
        "2.g3 Catalan Setup",
        "Coined: no name found. g3 with d4 is the Catalan's setup, usually with c4 and Bg2 to follow.",
      ],
      [
        "d4d5",
        "2.d5 Space Grab",
        "Coined: no name found. The pawn pushes on at once, taking space and cramping …e6.",
      ],
      [
        "a2a3",
        "2.a3 Late Anderssen",
        "Coined: no name found. 1.a3 is Anderssen's Opening; here White plays it a move later.",
      ],
    ],
  },
};

/**
 * Black's own moves one level further down (the position before as moves from
 * the start), each holding White's replies your games met (5 games or more).
 * A reply's folder goes deeper again when an entry starts there.
 */
const BLACK_MOVES: readonly {
  at: readonly string[];
  pick: string;
  name: string;
  note?: string;
  replies: readonly Reply[];
}[] = [
  {
    at: ["e2e4", "e7e6", "d2d4"],
    pick: "d7d5",
    name: "2…d5 Main Line",
    note: "Named from the literature: 2…d5 is the French proper; lichess files the position under the French Defense itself.",
    replies: [
      ["e4e5", "3.e5 Advance"],
      ["e4d5", "3.exd5 Exchange"],
      ["b1c3", "3.Nc3 Paulsen"],
      ["b1d2", "3.Nd2 Tarrasch"],
      ["f1d3", "3.Bd3 Schlechter"],
      ["c2c4", "3.c4 Diemer-Duhm Gambit"],
      ["g1f3", "3.Nf3 Perseus Gambit"],
    ],
  },
  {
    at: ["e2e4", "e7e6", "g1f3"],
    pick: "d7d5",
    name: "2…d5 Main Line",
    note: "Named from the literature: …d5 is the French's main answer; lichess lists no name for this exact position.",
    replies: [
      [
        "e4d5",
        "3.exd5 Exchange",
        "Named by analogy: the same capture as the French Exchange Variation (1.e4 e6 2.d4 d5 3.exd5), here before d4.",
      ],
      [
        "e4e5",
        "3.e5 Advance",
        "Named by analogy: the same push as the French Advance Variation (1.e4 e6 2.d4 d5 3.e5), here before d4.",
      ],
      ["b1c3", "3.Nc3 Two Knights"],
      [
        "d2d3",
        "3.d3 King's Indian Attack",
        "Named by analogy: Nf3 with d3 is the King's Indian Attack's setup (lichess: French Defense: King's Indian Attack, 1.e4 e6 2.d3).",
      ],
      [
        "d2d4",
        "3.d4 Perseus Gambit",
        "A transposition: the French Defense, Perseus Gambit (1.e4 e6 2.d4 d5 3.Nf3).",
      ],
      [
        "f1b5",
        "3.Bb5+ Spite Check",
        "Coined: no name found. A check that achieves little: …c6 or …Bd7 blocks it with tempo.",
      ],
      [
        "f1c4",
        "3.Bc4 Late Bishop's",
        "Coined: no name found. 2.Bc4 is the Bishop's Opening against the French; here it comes a move later, walking into …dxe4 or …dxc4.",
      ],
    ],
  },
  {
    at: ["e2e4", "e7e6", "d2d4", "d7d5", "e4e5"],
    pick: "c7c5",
    name: "3…c5 Main Line",
    note: "Named from the literature: 3…c5 is the main answer to the Advance; lichess files it under the Advance Variation itself.",
    replies: [
      [
        "c2c3",
        "4.c3 Classical",
        "Named from the literature: the classical way to hold d4, the Advance's main line; lichess files it under the Advance Variation.",
      ],
      ["g1f3", "4.Nf3 Nimzowitsch System"],
      ["d4c5", "4.dxc5 Steinitz"],
      [
        "f1b5",
        "4.Bb5+ Spite Check",
        "Coined: no name found. A check that achieves little: …Bd7 or …Nc6 blocks it with tempo.",
      ],
      [
        "c1e3",
        "4.Be3 Bishop Guard",
        "Coined: no name found. The bishop guards d4 in place of the usual c3.",
      ],
      [
        "f2f4",
        "4.f4 Pawn Wall",
        "Coined: no name found. White backs the e5 pawn with f4, building a wall in front of the king.",
      ],
      [
        "c2c4",
        "4.c4 Flank Strike",
        "Coined: no name found. White hits d5 from the side instead of supporting d4.",
      ],
      ["d1g4", "4.Qg4 Nimzowitsch Attack"],
    ],
  },
  {
    at: ["e2e4", "e7e6", "g1f3", "d7d5", "e4d5"],
    pick: "e6d5",
    name: "3…exd5 Main Line",
    note: "Named from the literature: the natural recapture, opening the c8 bishop; lichess lists no name for this exact position.",
    replies: [
      [
        "d2d4",
        "4.d4 Exchange French",
        "A transposition: the French Exchange Variation (1.e4 e6 2.d4 d5 3.exd5 exd5 4.Nf3). Games reach the same position from both sides.",
      ],
      [
        "b1c3",
        "4.Nc3 Two Knights",
        "Named by analogy: Nf3 and Nc3 against …d5, as in the French Two Knights (1.e4 e6 2.Nf3 d5 3.Nc3).",
      ],
      [
        "d1e2",
        "4.Qe2+ Queen Check",
        "Coined: no name found. The check asks …Qe7 (offering a queen trade) or …Be7.",
      ],
      [
        "f1b5",
        "4.Bb5+ Spite Check",
        "Coined: no name found. A check that achieves little: …c6 or …Bd7 blocks it with tempo.",
      ],
      [
        "f1e2",
        "4.Be2 Quiet Bishop",
        "Coined: no name found. The bishop develops modestly to e2, ready to castle.",
      ],
      [
        "d2d3",
        "4.d3 Small Center",
        "Coined: no name found. White settles for d3 instead of d4, as in the Philidor's 2…d6 Small Center on the other side.",
      ],
      [
        "c2c4",
        "4.c4 Monte Carlo",
        "Named by analogy: lichess calls the same c4 strike in the Exchange Variation (4.c4, with d4) the Monte Carlo Variation.",
      ],
    ],
  },
  {
    at: ["e2e4", "e7e6", "d2d4", "d7d5", "e4d5"],
    pick: "e6d5",
    name: "3…exd5 Main Line",
    note: "Named from the literature: the natural recapture; lichess files the position under the Exchange Variation itself.",
    replies: [
      [
        "g1f3",
        "4.Nf3 Knight Line",
        "Coined: lichess files it under the Exchange Variation. The same position as 2.Nf3 d5 3.exd5 exd5 4.d4; games reach it from both sides.",
      ],
      [
        "b1c3",
        "4.Nc3 Queen's Knight",
        "Named by analogy: the French Queen's Knight (2.Nc3), here after the exchange.",
      ],
      [
        "f1d3",
        "4.Bd3 Classical",
        "Named from the literature: 4.Bd3 is the classical development in the Exchange Variation.",
      ],
      ["c2c4", "4.c4 Monte Carlo"],
      [
        "d1e2",
        "4.Qe2+ Queen Check",
        "Coined: no name found. The check asks …Qe7 (offering a queen trade) or …Be7.",
      ],
      [
        "h2h3",
        "4.h3 Waiting Move",
        "Coined: no name found. A quiet pawn move that keeps …Bg4 out before developing.",
      ],
      [
        "c1f4",
        "4.Bf4 London Setup",
        "Named by analogy: d4 with an early Bf4 is the London System's setup.",
      ],
      [
        "f1b5",
        "4.Bb5+ Spite Check",
        "Coined: no name found. A check that achieves little: …c6 or …Bd7 blocks it with tempo.",
      ],
    ],
  },
];

const deeperBlack = (moves: readonly string[]): TrainerFolder[] =>
  BLACK_MOVES.filter((t) => t.at.join(" ") === moves.join(" ")).map((t) =>
    folder(
      t.name,
      [...moves, t.pick],
      t.replies.map(([reply, name, note]) =>
        folder(name, [...moves, t.pick, reply], deeperBlack([...moves, t.pick, reply]), note),
      ),
      t.note,
    ),
  );

/** A Black folder: ids carry the colour, since White's tree has folders at the same moves. */
const blackIds = (f: TrainerFolder): TrainerFolder => ({
  ...f,
  id: `b-${f.moves.join("-")}`,
  children: f.children.map(blackIds),
});

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
  b: WHITE_FIRST_MOVES.map(([uci, name]) => {
    const mine = BLACK_REPLIES[uci];
    const inside = mine
      ? [
          folder(
            mine.name,
            [uci, mine.pick],
            mine.replies.map(([reply, replyName, note]) =>
              folder(
                replyName,
                [uci, mine.pick, reply],
                deeperBlack([uci, mine.pick, reply]),
                note,
              ),
            ),
            mine.note,
          ),
        ]
      : [];
    return blackIds(folder(name, [uci], inside));
  }),
};
