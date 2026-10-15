# Codenames — the rules

**Source:** the rulebook, *Codenames* by Vlaada Chvátil (Czech Games Edition, July 2015). It ships with the game as `packages/web/src/games/codenames/assets/rules.pdf`, and How to Play opens it. Page numbers below are the rulebook's.

This file follows the rulebook section by section. Under each rule, **App** says how this implementation plays it. The app's own additions come after, under [Table rules](#table-rules-the-apps-own). If the code and the rulebook disagree, the rulebook wins: fix `rules.ts` (or `clue-rules.ts`) and this file together.

## Setup (pp. 2–3)
- Players split into two teams of similar size and skill. A standard game needs at least four players: two teams of two.
- Each team chooses one **spymaster**. The other players are **field operatives**.
- 25 codenames are dealt at random in a 5×5 grid.
- **The key**, chosen at random, gives every card its secret identity:
  - the **starting team** has 9 agents (its 8, plus the double agent)
  - the other team has 8
  - 7 innocent bystanders
  - 1 assassin
- The starting team gives the first clue.

**App**
- The words come from our own curated lists (`words/en.ts`, `words/de.ts`), not the printed cards. The deal never puts two clashing words on one board, such as HORSE and HORSESHOE (`board.ts`).
- The key and the starting team are drawn from the game's seed.
- Teams are Red (0) and Blue (1). Roles come from the seat index (`seating.ts`): seat 0 is the Red spymaster and seat 1 the Blue spymaster, and the remaining seats alternate Red operative, Blue operative. A table of 4–8 is therefore two teams that differ by at most one player.

## Giving a clue (p. 4)
- The spymaster says **one word** and **one number**: how many codenames on the table the clue relates to. Example: NUT and BARK both grow on trees, so *tree: 2*.
- The clue must be one word, with no extra hints ("It's always a bit of a stretch.").
- It can't be a codename visible on the table. Once a codename is covered, it no longer restricts clues.
- **Expert clues** (p. 7):
  - **0**: "None of our words relate to *feathers*." There is no limit on guesses, but the operatives must still make at least one.
  - **Unlimited** (∞): for when several earlier clues still have unguessed words. The operatives don't learn how many words the new clue is for, but may guess as many as they like.

**App**
- The number is 0–9 or ∞.
- What may be said is enforced mechanically; see [Valid clues](#valid-clues-pp-67).
- The spymaster can tap the cards the clue means while writing it. Only their own team's agents can be tapped, and the server keeps no other card as a clue's target, whether a person or an AI gave it. The note stays secret until the game is over.

## Making contact (p. 4)
- The operatives may debate. The spymaster keeps a straight face.
- An operative **touching** a codename is the official guess. The card is then covered:
  - **own agent**: the team may guess again (but gets no new clue)
  - **innocent bystander**: the turn ends
  - **other team's agent**: the turn ends, and it helps the other team
  - **assassin**: the game ends, and the team that contacted it loses
- **Number of guesses:**
  - The operatives must always make at least one guess.
  - Any wrong guess ends the turn at once.
  - They may stop at any time.
  - In all they may guess **the number plus one**. The extra guess is usually for a word left over from an earlier clue.

**App**
- If a team has human operatives, any of them may touch cards.
- When another person guesses on your team, touching is two steps: a tap **picks** a card, which also points it out to the team (see [Pointers](#table-rules-the-apps-own)), and the Touch button on it (or Enter) commits. A player can turn on one-tap touching for themselves.
- With no other person on your team's guessing side, as in solo, there is no one to point a card out to, so a tap touches.
- A team with no human operative is played by its lowest-seated AI operative. Any other AI operatives on that team sit out.

## Ending the game (p. 5)
- A team wins when all its agents are covered. This includes the case where **the other team** touches its last one.
- A team whose operative touches the assassin loses.
- *Setup for the next game:* "Do other people want a chance to be spymasters?" For the app's version, see Rematch below.

## Penalty for invalid clues (p. 5)
- An invalid clue ends the team's turn at once, and the other spymaster may cover one of their own words before giving their next clue.
- "But if no one notices that a clue is invalid, it counts as valid."

**App:** the server refuses any clue its mechanical check knows is invalid before it is given, so the penalty never comes up. A clue the check can't catch (a clue about letters, a rhyme by sound) counts as valid, as the rulebook says.

## Keeping a straight face (p. 5)
The spymaster doesn't react while the operatives think. The operatives look at the table, not at their spymaster.

**App:** spymasters can't post in team chat. They can read it.

## The timer (p. 5)
The sand timer is optional. If a player is thinking too long, anyone can flip it and ask them to decide before it runs out.

**App:** the clue timer and guess timer are both optional and set in the lobby. The rulebook leaves "time's up" to the table, so the app decides it:
- If the clue timer runs out, the turn passes with no clue (`clue-timeout`).
- If the guess timer runs out, the turn ends (`guess-timeout`). It runs once per turn, not once per guess.
- Timers are never armed for AI seats.

## Valid clues (pp. 6–7)
"Some groups like the rules one way. Some like the rules another way." This is where the app makes its choices.

### Firm rules
| Rulebook | App |
|---|---|
| The clue must be about meaning, not letters or table position (*gland* for ENGLAND, *b: 3*, *three: 3*). | Meaning can't be checked by a machine. A clue that shares spelling with a table word (GLAND / ENGLAND) goes to the opposing spymaster, below. |
| Letters and numbers are fine when they mean something (*X: 1* for RAY, *eight: 3* for OCTOPUS). | Allowed: a clue is any one token of letters. |
| The number can't be used as part of the clue (*citrus: 8* for LEMON and OCTOPUS). | Not checked; up to the players. |
| Play in English; a foreign word only if your group would use it in an English sentence (*strudel*, not *Apfel*). | Not checked. German tables play in German. |
| No form of a visible word: until BREAK is covered, not *break, broken, breakage, breakdown*. | Forms are refused outright: inflections, irregular forms (BROKEN, MICE) and other spellings (THEATRE / THEATER). Derivations and compounds (*breakage*, *breakdown*) go to the opposing spymaster. |
| No part of a compound on the table: until HORSESHOE is covered, not *horse, shoe, unhorsed, snowshoe*. | *horse* and *shoe* go to the opposing spymaster. *unhorsed* and *snowshoe* share only a buried part, which the check can't see, so they are up to the players. |

### Homonyms and spelling
- Words that sound alike but are spelled differently are **different words**: *k-n-i-g-h-t* is allowed with NIGHT on the table.
- Words spelled the same are **the same word**: *bow* (archery) is BOW (theatre, ship). *Theatre* and *theater* are forms of one word.

**App:** an exact match or another spelling is refused. KNIGHT shares spelling with NIGHT, so it goes to the opposing spymaster, who will normally allow it, as the rulebook does.

### Don't be too strict
"*Island* is a valid clue for ENGLAND. Even *land* is a valid clue for ENGLAND. And anybody who says you can't say *sparrow* when ROW is on the table is just trying to cause trouble. If the opposing spymaster allows it, the clue is valid. If you aren't sure, ask your opponent. (Quietly, so the others can't hear.)"

**App:** this is the clue question. See [Clue rulings](#clue-rulings-clue-rulests).

### Flexible rules (the app's choices)
- **Compound words:** only one-word compounds (*greenhouse*) and hyphenated ones (*mother-in-law*). Two-word ones (*pack rat*) are not allowed, and no invented compounds.
- **Proper names:** one-word names only (*George*). There is no exception for multi-word place names: *New York* is two words.
- **Acronyms and abbreviations:** allowed as words (CIA, UK, PhD, laser).
- **Homonyms** (the liberal variant) and **rhymes** by sound alone are not checked and are left to the players. The rulebook allows rhymes that refer to meaning (*snail* for MAIL).

## With fewer players (p. 8)
The rulebook's two- and three-player variants have one team against a simulated opponent, or one operative serving both spymasters.

**App:** neither is offered. Solo play instead seats you at a full four-seat table, as Red's spymaster or its operative, with AI in every other seat. The four seats are fixed, because extra AI operatives would add nothing for you to decide. Rooms seat 4–8 people and AI. For two players, there is *Codenames: Duet*.

---

## Clue rulings (`clue-rules.ts`)
A machine can't judge meaning, so the app enforces a mechanical version of the rules above. The server, the AI and the clue composer all use this one check.
- A clue is one token of letters. An apostrophe or hyphen inside the word is allowed. No spaces or digits. At most 30 characters.
- A clue may not match a **face-down** word on the table. Comparisons fold case, accents, ß and umlauts. Covered cards no longer restrict clues.
- A clue may not be a **form** of a face-down word. Forms are always refused:
  - the same inflection stem, or the word plus an inflection ending: HORSES, RUNNING, MAKING, PARTIES for HORSE, RUN, MAKE, PARTY
    - en stems: -s, -es, -ed, -ing, -er, -ies, -y
    - en endings: -s, -es, -d, -ed, -ing, -er, -ers, -est, -ly, -y, including a doubled consonant (run → running), a dropped e (make → making) and y → i (party → parties)
    - de: -e, -en, -n, -er, -es, -s, -ung, -chen, -lein, …
  - an **irregular form** (en): BROKE and BROKEN for BREAK, WENT for GO, MICE for MOUSE, KNIVES for KNIFE, BETTER for GOOD, …
    - Some forms are also words of their own: FOUND (a city), a SAW, a ROSE, LEFT. These tie to FIND, SEE, RISE and LEAVE only by spelling, so they go to the opposing spymaster instead.
  - the **other spelling** of the word (en): THEATRE / THEATER, COLOUR / COLOR, ORGANISE / ORGANIZE, ANALYSE / ANALYZE, CATALOGUE / CATALOG, TRAVELLED / TRAVELED
    - There is a list of real words this would wrongly merge: TIMBRE is not TIMBER.
- A clue that only shares **spelling** with a face-down word is not refused outright. That means one word starts or ends the other (the shorter at least 3 letters), also after one derivational prefix (en: *sub-, un-, re-, over-, trans-…*; de: *ver-, vor-, unter-, be-…*) is stripped from either. Instead the spymaster **asks the opposing spymaster**:
  - The two spymasters see the word and the table word it shares spelling with. Everyone else sees only that a question is open. The record of questions reaches the operatives only after the game.
  - **Allowed:** the clue is given as asked. **Refused:** the spymaster thinks again. **Withdrawn:** the asker takes it back.
  - **No answer within 45 s:** the clue stands. The rulebook: "If no one notices that a clue is invalid, it counts as valid."
  - The clue timer stops while a question is open. A refusal gives back the time that was left.
  - **Same rules for everyone.** An AI spymaster asks too. A person rules on an AI's question, and an AI spymaster rules on a person's. The model judges with the rulebook's own text on these pages quoted to it.
  - Without a model, a stand-in judge rules:
    - **allows** a table word of 3 letters or fewer (SPARROW / ROW)
    - **allows** a word whose leftover is only a fragment (LAND / ENGLAND)
    - **refuses** a table word buried inside the clue (UNHORSED / HORSE)
    - **refuses** a compound of two real words (HORSESHOE / HORSE)
  - An AI spymaster that is refused gives its next-best idea that needs no question, else the stand-in's clue. It asks no second question and makes no second model call.
  - Duet has no opposing spymaster, so it refuses spelling clashes outright.
- Anything the check can't catch is up to the players, as the rulebook says: a clue about letters, the number used in the clue, a rhyme by sound, or a compound part buried mid-word (SNOWSHOE / HORSESHOE).

## Table rules (the app's own)
- **Pointers.** Each operative has one. Picking a card puts their avatar on it, so the team can see which card each of them would touch.
  - Picking another card moves it; picking the same card again lifts it. Pointers clear at the end of the turn.
  - Only the team's operatives see them: not their spymaster, not the other team, not spectators.
  - They are offered only when another person guesses on your team.
- **Sticky notes.** Any of the team's operatives may pin one of the team's earlier clues to a face-down card ("we think OCEAN meant this"). They can do this on any turn, including the other team's.
  - Notes are seen by the same people as pointers.
  - A note goes away when its card is covered.
- **Someone drops out** (rooms; `presence.ts`):
  - The roster marks them *away*. The people still at the table see who it is, and whether the game is waiting on them (their clue, their guesses, their ruling).
  - After 45 s anyone still there may **let the AI play their seat**. It plays at the table's own AI level, or the top level at an all-human table. Any running clock for that seat stops.
  - The person takes the seat back the moment they return. If the AI is mid-move for them, they take it back as soon as that move is done.
  - The saved game still lists the seat as theirs.
- **Rematch** (rooms): once the game is over, the host can start the next one at once, with the same people, AI and options.
  - **Rotate spymasters** (the rulebook's "Do other people want a chance to be spymasters?") moves every seat two places, wrapping round within each team. Each team's next operative becomes its spymaster, and nobody changes team, even at an odd table.
  - A rematch needs everyone who played to still be connected.
