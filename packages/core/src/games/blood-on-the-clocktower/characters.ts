// Blood on the Clocktower — Trouble Brewing character data.
//
// Source: the official Trouble Brewing character sheet (2021-10-27 Ben Finney
// print, © Steven Medway / The Pandemonium Institute) and the boxed night
// sheet. Only Trouble Brewing is implemented; the types leave room for other
// editions later.

export type CharacterType = "townsfolk" | "outsider" | "minion" | "demon" | "traveller";

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
  | "thief";

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
};

/** The five Trouble Brewing travellers, in sheet order. */
export const TRAVELLERS: readonly CharacterId[] = [
  "scapegoat",
  "gunslinger",
  "beggar",
  "bureaucrat",
  "thief",
];

/** Character sheet display order (as printed, by type). */
export const CHARACTER_SHEET_ORDER: readonly CharacterId[] = [
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

export function isEvil(type: CharacterType): boolean {
  return type === "minion" || type === "demon";
}

export function charactersOfType(type: CharacterType): Character[] {
  return CHARACTER_SHEET_ORDER.map((id) => CHARACTERS[id]).filter((c) => c.type === type);
}
