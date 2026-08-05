// Blood on the Clocktower — Trouble Brewing & Bad Moon Rising character data.
//
// Source: the official character sheets (© Steven Medway / The Pandemonium
// Institute) and the boxed night sheets (BMR night positions cross-checked
// against the official script-tool night ordering).

export type CharacterType = "townsfolk" | "outsider" | "minion" | "demon" | "traveller";

export type Edition = "trouble-brewing" | "bad-moon-rising";

export const EDITION_NAME: Record<Edition, string> = {
  "trouble-brewing": "Trouble Brewing",
  "bad-moon-rising": "Bad Moon Rising",
};

export type CharacterId =
  | "washerwoman"
  | "librarian"
  | "investigator"
  | "chef"
  | "empath"
  | "fortune-teller"
  | "undertaker"
  | "monk"
  | "ravenkeeper"
  | "virgin"
  | "slayer"
  | "soldier"
  | "mayor"
  | "butler"
  | "drunk"
  | "recluse"
  | "saint"
  | "poisoner"
  | "spy"
  | "scarlet-woman"
  | "baron"
  | "imp"
  | "scapegoat"
  | "gunslinger"
  | "beggar"
  | "bureaucrat"
  | "thief"
  // ── Bad Moon Rising ─────────────────────────────────────────────────
  | "grandmother"
  | "sailor"
  | "chambermaid"
  | "exorcist"
  | "innkeeper"
  | "gambler"
  | "gossip"
  | "courtier"
  | "professor"
  | "minstrel"
  | "tea-lady"
  | "pacifist"
  | "fool"
  | "goon"
  | "lunatic"
  | "tinker"
  | "moonchild"
  | "godfather"
  | "devils-advocate"
  | "assassin"
  | "mastermind"
  | "zombuul"
  | "pukka"
  | "shabaloth"
  | "po"
  | "apprentice"
  | "matron"
  | "voudon"
  | "judge"
  | "bishop";

export type Character = {
  id: CharacterId;
  name: string;
  type: CharacterType;
  /** Ability text as printed on the character sheet. */
  ability: string;
  /**
   * Storyteller instruction for this character's night-wizard step. Absent =
   * the character never wakes on that night type.
   */
  firstNightAction?: string;
  otherNightsAction?: string;
  /** Orange-flower setup adjustment, e.g. the Baron's "[+2 Outsiders]". */
  setup?: string;
};

export const CHARACTERS: Record<CharacterId, Character> = {
  washerwoman: {
    id: "washerwoman",
    name: "Washerwoman",
    type: "townsfolk",
    ability: "You start knowing that 1 of 2 players is a particular Townsfolk.",
    firstNightAction:
      "Show the Townsfolk character token, then point to the two marked players (one really is that Townsfolk).",
  },
  librarian: {
    id: "librarian",
    name: "Librarian",
    type: "townsfolk",
    ability:
      "You start knowing that 1 of 2 players is a particular Outsider. (Or that zero are in play.)",
    firstNightAction:
      "Show the Outsider character token, then point to the two marked players — or show a 0 (zero) if no Outsiders are in play.",
  },
  investigator: {
    id: "investigator",
    name: "Investigator",
    type: "townsfolk",
    ability: "You start knowing that 1 of 2 players is a particular Minion.",
    firstNightAction:
      "Show the Minion character token, then point to the two marked players (one really is that Minion).",
  },
  chef: {
    id: "chef",
    name: "Chef",
    type: "townsfolk",
    ability: "You start knowing how many pairs of evil players there are.",
    firstNightAction: "Show a number of fingers: how many pairs of neighbouring evil players.",
  },
  empath: {
    id: "empath",
    name: "Empath",
    type: "townsfolk",
    ability: "Each night, you learn how many of your 2 alive neighbours are evil.",
    firstNightAction: "Show a number of fingers: how many of their 2 alive neighbours are evil.",
    otherNightsAction: "Show a number of fingers: how many of their 2 alive neighbours are evil.",
  },
  "fortune-teller": {
    id: "fortune-teller",
    name: "Fortune Teller",
    type: "townsfolk",
    ability:
      "Each night, choose 2 players: you learn if either is a Demon. There is a good player that registers as a Demon to you.",
    firstNightAction: "They point to two players. Nod if either is the Demon (or the red herring).",
    otherNightsAction:
      "They point to two players. Nod if either is the Demon (or the red herring).",
  },
  undertaker: {
    id: "undertaker",
    name: "Undertaker",
    type: "townsfolk",
    ability: "Each night*, you learn which character died by execution today.",
    otherNightsAction: "Show the character token of the player executed today.",
  },
  monk: {
    id: "monk",
    name: "Monk",
    type: "townsfolk",
    ability: "Each night*, choose a player (not yourself): they are safe from the Demon tonight.",
    otherNightsAction:
      "They point to a player (not themself). That player is safe from the Demon tonight.",
  },
  ravenkeeper: {
    id: "ravenkeeper",
    name: "Ravenkeeper",
    type: "townsfolk",
    ability: "If you die at night, you are woken to choose a player: you learn their character.",
    otherNightsAction:
      "They died tonight — wake them. They point to a player; show that player's character token.",
  },
  virgin: {
    id: "virgin",
    name: "Virgin",
    type: "townsfolk",
    ability:
      "The 1st time you are nominated, if the nominator is a Townsfolk, they are executed immediately.",
  },
  slayer: {
    id: "slayer",
    name: "Slayer",
    type: "townsfolk",
    ability:
      "Once per game, during the day, publicly choose a player: if they are the Demon, they die.",
  },
  soldier: {
    id: "soldier",
    name: "Soldier",
    type: "townsfolk",
    ability: "You are safe from the Demon.",
  },
  mayor: {
    id: "mayor",
    name: "Mayor",
    type: "townsfolk",
    ability:
      "If only 3 players live & no execution occurs, your team wins. If you die at night, another player might die instead.",
  },
  butler: {
    id: "butler",
    name: "Butler",
    type: "outsider",
    ability:
      "Each night, choose a player (not yourself): tomorrow, you may only vote if they are voting too.",
    firstNightAction:
      "They point to a player (not themself): that player is their master tomorrow.",
    otherNightsAction:
      "They point to a player (not themself): that player is their master tomorrow.",
  },
  drunk: {
    id: "drunk",
    name: "Drunk",
    type: "outsider",
    ability:
      "You do not know you are the Drunk. You think you are a Townsfolk character, but you are not.",
    setup: "Assign a not-in-play Townsfolk token that this player believes they are.",
  },
  recluse: {
    id: "recluse",
    name: "Recluse",
    type: "outsider",
    ability: "You might register as evil & as a Minion or Demon, even if dead.",
  },
  saint: {
    id: "saint",
    name: "Saint",
    type: "outsider",
    ability: "If you die by execution, your team loses.",
  },
  poisoner: {
    id: "poisoner",
    name: "Poisoner",
    type: "minion",
    ability: "Each night, choose a player: they are poisoned tonight and tomorrow day.",
    firstNightAction: "They point to a player: that player is poisoned tonight and tomorrow day.",
    otherNightsAction: "They point to a player: that player is poisoned tonight and tomorrow day.",
  },
  spy: {
    id: "spy",
    name: "Spy",
    type: "minion",
    ability:
      "Each night, you see the Grimoire. You might register as good & as a Townsfolk or Outsider, even if dead.",
    firstNightAction: "Show them the Grimoire for as long as they need.",
    otherNightsAction: "Show them the Grimoire for as long as they need.",
  },
  "scarlet-woman": {
    id: "scarlet-woman",
    name: "Scarlet Woman",
    type: "minion",
    ability:
      "If there are 5 or more players alive (Travellers don't count) & the Demon dies, you become the Demon.",
    otherNightsAction:
      "The Demon died today and 5+ players were alive — show her the YOU ARE info and the Imp token.",
  },
  baron: {
    id: "baron",
    name: "Baron",
    type: "minion",
    ability: "There are extra Outsiders in play. [+2 Outsiders]",
    setup: "[+2 Outsiders] — two Townsfolk are replaced by two extra Outsiders.",
  },
  imp: {
    id: "imp",
    name: "Imp",
    type: "demon",
    ability:
      "Each night*, choose a player: they die. If you kill yourself this way, a Minion becomes the Imp.",
    otherNightsAction:
      "They point to a player: that player dies (unless protected). A self-kill passes the Imp to a Minion.",
  },
  // ── Travellers ──────────────────────────────────────────────────────
  // Join and leave mid-game; their character is PUBLIC, their alignment is
  // assigned secretly by the Storyteller. Exile (≥ half of ALL players'
  // votes) kills them without counting as the day's execution.
  scapegoat: {
    id: "scapegoat",
    name: "Scapegoat",
    type: "traveller",
    ability: "If a player of your alignment is executed, you might be executed instead.",
  },
  gunslinger: {
    id: "gunslinger",
    name: "Gunslinger",
    type: "traveller",
    ability:
      "Each day, after the 1st vote has been tallied, you may choose a player that voted: they die.",
  },
  beggar: {
    id: "beggar",
    name: "Beggar",
    type: "traveller",
    ability:
      "You must use a vote token to vote. If a dead player gives you theirs, you learn their alignment. You are sober and healthy.",
  },
  bureaucrat: {
    id: "bureaucrat",
    name: "Bureaucrat",
    type: "traveller",
    ability: "Each night, choose a player (not yourself): their vote counts as 3 votes tomorrow.",
    firstNightAction:
      "They point to a player (not themself): that player's vote counts as 3 votes tomorrow.",
    otherNightsAction:
      "They point to a player (not themself): that player's vote counts as 3 votes tomorrow.",
  },
  thief: {
    id: "thief",
    name: "Thief",
    type: "traveller",
    ability: "Each night, choose a player (not yourself): their vote counts negatively tomorrow.",
    firstNightAction:
      "They point to a player (not themself): that player's vote counts NEGATIVELY tomorrow.",
    otherNightsAction:
      "They point to a player (not themself): that player's vote counts NEGATIVELY tomorrow.",
  },
  // ── Bad Moon Rising — Townsfolk ─────────────────────────────────────
  grandmother: {
    id: "grandmother",
    name: "Grandmother",
    type: "townsfolk",
    ability:
      "You start knowing a good player & their character. If the Demon kills them, you die too.",
    firstNightAction: "Show the grandchild's character token, then point at the grandchild player.",
  },
  sailor: {
    id: "sailor",
    name: "Sailor",
    type: "townsfolk",
    ability:
      "Each night, choose an alive player: either you or they are drunk until dusk. You can't die.",
    firstNightAction:
      "They point at an alive player. Either the Sailor or that player is drunk until dusk — your choice.",
    otherNightsAction:
      "They point at an alive player. Either the Sailor or that player is drunk until dusk — your choice.",
  },
  chambermaid: {
    id: "chambermaid",
    name: "Chambermaid",
    type: "townsfolk",
    ability:
      "Each night, choose 2 alive players (not yourself): you learn how many woke tonight due to their ability.",
    firstNightAction:
      "They point at two alive players (not themself). Show fingers: how many woke tonight due to their ability.",
    otherNightsAction:
      "They point at two alive players (not themself). Show fingers: how many woke tonight due to their ability.",
  },
  exorcist: {
    id: "exorcist",
    name: "Exorcist",
    type: "townsfolk",
    ability:
      "Each night*, choose a player (different to last night): the Demon, if chosen, learns who you are then doesn't wake tonight.",
    otherNightsAction:
      "They point at a player (different to last night). If it's the Demon: wake the Demon, show them the Exorcist, and the Demon doesn't act tonight.",
  },
  innkeeper: {
    id: "innkeeper",
    name: "Innkeeper",
    type: "townsfolk",
    ability: "Each night*, choose 2 players: they can't die tonight, but 1 is drunk until dusk.",
    otherNightsAction:
      "They point at two players. Both are safe from death tonight; one of them (your choice) is drunk until dusk.",
  },
  gambler: {
    id: "gambler",
    name: "Gambler",
    type: "townsfolk",
    ability: "Each night*, choose a player & guess their character: if you guess wrong, you die.",
    otherNightsAction:
      "They point at a player, then at a character on the sheet. If the guess is wrong, the Gambler dies. Never say whether it was right.",
  },
  gossip: {
    id: "gossip",
    name: "Gossip",
    type: "townsfolk",
    ability: "Each day, you may make a public statement. Tonight, if it was true, a player dies.",
  },
  courtier: {
    id: "courtier",
    name: "Courtier",
    type: "townsfolk",
    ability: "Once per game, at night, choose a character: they are drunk for 3 nights & 3 days.",
    firstNightAction:
      "They shake their head no, or point at a character on the sheet. If in play, that player is drunk for 3 nights & 3 days.",
    otherNightsAction:
      "They shake their head no, or point at a character on the sheet. If in play, that player is drunk for 3 nights & 3 days.",
  },
  professor: {
    id: "professor",
    name: "Professor",
    type: "townsfolk",
    ability:
      "Once per game, at night*, choose a dead player: if they are a Townsfolk, they are resurrected.",
    otherNightsAction:
      "They shake their head no, or point at a dead player. If that player is a Townsfolk, they are resurrected.",
  },
  minstrel: {
    id: "minstrel",
    name: "Minstrel",
    type: "townsfolk",
    ability:
      "When a Minion dies by execution, all other players (except Travellers) are drunk until dusk tomorrow.",
  },
  "tea-lady": {
    id: "tea-lady",
    name: "Tea Lady",
    type: "townsfolk",
    ability: "If both your alive neighbors are good, they can't die.",
  },
  pacifist: {
    id: "pacifist",
    name: "Pacifist",
    type: "townsfolk",
    ability: "Executed good players might not die.",
  },
  fool: {
    id: "fool",
    name: "Fool",
    type: "townsfolk",
    ability: "The 1st time you die, you don't.",
  },
  // ── Bad Moon Rising — Outsiders ─────────────────────────────────────
  goon: {
    id: "goon",
    name: "Goon",
    type: "outsider",
    ability:
      "Each night, the 1st player to choose you with their ability is drunk until dusk. You become their alignment.",
  },
  lunatic: {
    id: "lunatic",
    name: "Lunatic",
    type: "outsider",
    ability:
      "You think you are a Demon, but you are not. The Demon knows who you are & who you choose at night.",
    setup: "Swap the Lunatic and Demon tokens in the Grimoire after the draw.",
  },
  tinker: {
    id: "tinker",
    name: "Tinker",
    type: "outsider",
    ability: "You might die at any time.",
  },
  moonchild: {
    id: "moonchild",
    name: "Moonchild",
    type: "outsider",
    ability:
      "When you learn that you died, publicly choose 1 alive player. Tonight, if it was a good player, they die.",
  },
  // ── Bad Moon Rising — Minions ───────────────────────────────────────
  godfather: {
    id: "godfather",
    name: "Godfather",
    type: "minion",
    ability:
      "You start knowing which Outsiders are in play. If 1 died today, choose a player tonight: they die. [−1 or +1 Outsider]",
    setup: "[−1 or +1 Outsider] — one Outsider is swapped for a Townsfolk, or vice versa.",
    firstNightAction: "Show the character tokens of all Outsiders in play.",
    otherNightsAction: "An Outsider died today — they point at any player. That player dies.",
  },
  "devils-advocate": {
    id: "devils-advocate",
    name: "Devil's Advocate",
    type: "minion",
    ability:
      "Each night, choose a living player (different to last night): if executed tomorrow, they don't die.",
    firstNightAction:
      "They point at a living player. If executed tomorrow, that player doesn't die.",
    otherNightsAction:
      "They point at a living player (different to last night). If executed tomorrow, that player doesn't die.",
  },
  assassin: {
    id: "assassin",
    name: "Assassin",
    type: "minion",
    ability:
      "Once per game, at night*, choose a player: they die, even if for some reason they could not.",
    otherNightsAction:
      "They shake their head no, or point at a player. That player dies — no protection prevents it.",
  },
  mastermind: {
    id: "mastermind",
    name: "Mastermind",
    type: "minion",
    ability:
      "If the Demon dies by execution (ending the game), play for 1 more day. If a player is then executed, their team loses.",
  },
  // ── Bad Moon Rising — Demons ────────────────────────────────────────
  zombuul: {
    id: "zombuul",
    name: "Zombuul",
    type: "demon",
    ability:
      "Each night*, if no-one died today, choose a player: they die. The 1st time you die, you live but register as dead.",
    otherNightsAction: "Nobody died today — they point at a player. That player dies.",
  },
  pukka: {
    id: "pukka",
    name: "Pukka",
    type: "demon",
    ability:
      "Each night, choose a player: they are poisoned. The previously poisoned player dies then becomes healthy.",
    firstNightAction: "They point at a player. That player is poisoned.",
    otherNightsAction:
      "The previously poisoned player dies. Then they point at a player, who is poisoned.",
  },
  shabaloth: {
    id: "shabaloth",
    name: "Shabaloth",
    type: "demon",
    ability:
      "Each night*, choose 2 players: they die. A dead player you chose last night might be regurgitated.",
    otherNightsAction:
      "You may first regurgitate one of last night's chosen players. Then they point at two players, one at a time: they die.",
  },
  po: {
    id: "po",
    name: "Po",
    type: "demon",
    ability:
      "Each night*, you may choose a player: they die. If your last choice was no-one, choose 3 players tonight.",
    otherNightsAction:
      "They shake their head no (charging up), or point at a player: they die. If they charged last night, they point at THREE players.",
  },
  // ── Bad Moon Rising — Travellers ────────────────────────────────────
  apprentice: {
    id: "apprentice",
    name: "Apprentice",
    type: "traveller",
    ability:
      "On your 1st night, you gain a Townsfolk ability (if good) or a Minion ability (if evil).",
    firstNightAction:
      "Show YOU ARE, then a Townsfolk token (if good) or Minion token (if evil). They gain that ability.",
  },
  matron: {
    id: "matron",
    name: "Matron",
    type: "traveller",
    ability:
      "Each day, you may choose up to 3 sets of 2 players to swap seats. Players may not leave their seats to talk in private.",
  },
  voudon: {
    id: "voudon",
    name: "Voudon",
    type: "traveller",
    ability:
      "Only you & the dead can vote. They don't need a vote token to do so. A 50% majority isn't required.",
  },
  judge: {
    id: "judge",
    name: "Judge",
    type: "traveller",
    ability:
      "Once per game, if another player nominated, you may choose to force the current execution to pass or fail.",
  },
  bishop: {
    id: "bishop",
    name: "Bishop",
    type: "traveller",
    ability:
      "Only the Storyteller can nominate. At least 1 opposing player must be nominated each day.",
  },
};

/** The five Trouble Brewing travellers, in sheet order. */
export const TRAVELLERS: readonly CharacterId[] = [
  "scapegoat",
  "gunslinger",
  "beggar",
  "bureaucrat",
  "thief",
];

/** The five Bad Moon Rising travellers, in sheet order. */
export const BMR_TRAVELLERS: readonly CharacterId[] = [
  "apprentice",
  "matron",
  "voudon",
  "judge",
  "bishop",
];

export function travellersOf(edition: Edition): readonly CharacterId[] {
  return edition === "bad-moon-rising" ? BMR_TRAVELLERS : TRAVELLERS;
}

/** Trouble Brewing sheet display order (as printed, by type). */
export const TB_SHEET_ORDER: readonly CharacterId[] = [
  "washerwoman",
  "librarian",
  "investigator",
  "chef",
  "empath",
  "fortune-teller",
  "undertaker",
  "monk",
  "ravenkeeper",
  "virgin",
  "slayer",
  "soldier",
  "mayor",
  "butler",
  "drunk",
  "recluse",
  "saint",
  "poisoner",
  "spy",
  "scarlet-woman",
  "baron",
  "imp",
  "scapegoat",
  "gunslinger",
  "beggar",
  "bureaucrat",
  "thief",
];

/** Bad Moon Rising sheet display order (as printed, by type). */
export const BMR_SHEET_ORDER: readonly CharacterId[] = [
  "grandmother",
  "sailor",
  "chambermaid",
  "exorcist",
  "innkeeper",
  "gambler",
  "gossip",
  "courtier",
  "professor",
  "minstrel",
  "tea-lady",
  "pacifist",
  "fool",
  "goon",
  "lunatic",
  "tinker",
  "moonchild",
  "godfather",
  "devils-advocate",
  "assassin",
  "mastermind",
  "zombuul",
  "pukka",
  "shabaloth",
  "po",
  "apprentice",
  "matron",
  "voudon",
  "judge",
  "bishop",
];

export function sheetOrderOf(edition: Edition): readonly CharacterId[] {
  return edition === "bad-moon-rising" ? BMR_SHEET_ORDER : TB_SHEET_ORDER;
}

export function editionOf(id: CharacterId): Edition {
  return BMR_SHEET_ORDER.includes(id) ? "bad-moon-rising" : "trouble-brewing";
}

/** All characters across editions, TB first — stable global display order. */
export const CHARACTER_SHEET_ORDER: readonly CharacterId[] = [
  ...TB_SHEET_ORDER,
  ...BMR_SHEET_ORDER,
];

/**
 * The boxed Trouble Brewing night sheet, FIRST NIGHT side, top to bottom.
 * The MINION INFO / DEMON INFO steps (7+ players) are inserted by the night
 * queue in companion.ts — they are not characters. Travellers that wake
 * (Thief, Bureaucrat) act at dusk, BEFORE everything here — the night queue
 * inserts them explicitly.
 */
export const FIRST_NIGHT_ORDER: readonly CharacterId[] = [
  "poisoner",
  "washerwoman",
  "librarian",
  "investigator",
  "chef",
  "empath",
  "fortune-teller",
  "butler",
  "spy",
];

/** The boxed Trouble Brewing night sheet, OTHER NIGHTS side, top to bottom. */
export const OTHER_NIGHTS_ORDER: readonly CharacterId[] = [
  "poisoner",
  "monk",
  "scarlet-woman",
  "imp",
  "ravenkeeper",
  "empath",
  "fortune-teller",
  "undertaker",
  "butler",
  "spy",
];

/**
 * Bad Moon Rising, FIRST NIGHT (official night-sheet ordering). The Lunatic's
 * fake demon info sits between MINION INFO and DEMON INFO and is inserted by
 * the night queue; the Apprentice's "gain an ability" step goes first when
 * one is seated.
 */
export const BMR_FIRST_NIGHT_ORDER: readonly CharacterId[] = [
  "sailor",
  "courtier",
  "godfather",
  "devils-advocate",
  "pukka",
  "grandmother",
  "chambermaid",
];

/**
 * Bad Moon Rising, OTHER NIGHTS (official night-sheet ordering). Gossip,
 * Tinker, Moonchild and Grandmother don't wake — they are Storyteller
 * kill-reminders resolved at these positions by the night queue. The four
 * Demons occupy consecutive slots; only the one in play gets a step.
 */
export const BMR_OTHER_NIGHTS_ORDER: readonly CharacterId[] = [
  "sailor",
  "courtier",
  "innkeeper",
  "gambler",
  "devils-advocate",
  "lunatic",
  "exorcist",
  "zombuul",
  "pukka",
  "shabaloth",
  "po",
  "assassin",
  "godfather",
  "gossip",
  "professor",
  "tinker",
  "moonchild",
  "grandmother",
  "chambermaid",
];

export function isEvil(type: CharacterType): boolean {
  return type === "minion" || type === "demon";
}

export function charactersOfType(type: CharacterType, edition?: Edition): Character[] {
  const order = edition ? sheetOrderOf(edition) : CHARACTER_SHEET_ORDER;
  return order.map((id) => CHARACTERS[id]).filter((c) => c.type === type);
}
