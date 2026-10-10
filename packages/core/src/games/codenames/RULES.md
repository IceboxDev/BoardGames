# Codenames — rules as implemented

Transcribed from the rulebook. **Please verify against your copy.** If a rule differs, fix it here and in `rules.ts` together.

## Setup
- 25 word cards in a 5×5 grid. Words come from our own curated lists (`words/en.ts`, `words/de.ts`), not the printed cards.
  - The deal never puts two clashing words on one board, for example HORSE and HORSESHOE (`board.ts`).
- The key card, drawn from the seed:
  - the **starting team** has 9 agents
  - the other team has 8
  - 7 bystanders
  - 1 assassin
- Teams are Red (0) and Blue (1). Roles come from the seat index (`seating.ts`):
  - seat 0 is the Red spymaster and seat 1 is the Blue spymaster
  - the remaining seats alternate Red operative, Blue operative
  - a table of 4–8 is therefore always two teams that differ by at most one player

## A turn
1. The current team's spymaster gives **one word and one number**, from 0 to 9 or ∞.
2. The team's operatives touch cards one at a time:
   - **own agent**: the card is covered and the team may keep guessing
   - **bystander** or **opposing agent**: the card is covered and the turn ends
   - **assassin**: the team loses at once
3. **Guess limit:** the number plus 1. A **0** or **∞** clue allows unlimited guesses.
4. The team must touch at least one card before it may stop.

If a team has human operatives, any of them may touch cards. They can also place **pointers** on cards, which are suggestions visible only to their own team.

If a team has no human operative, its lowest-seated AI operative guesses. Any other AI operatives on that team sit out.

## Winning
- A team wins when all its agents are covered. This includes the case where the **other team** covers the last one.
- A team that touches the assassin loses.

## Clue rulings (`clue-rules.ts`)
The engine can't judge meaning, so it enforces a mechanical version of the rule:
- A clue is one token of letters. An apostrophe or hyphen inside the word is allowed. No spaces or digits. At most 30 characters.
- A clue may not match a **face-down** word on the table. Comparisons fold case, accents, ß and umlauts. Covered cards no longer restrict clues.
- A clue may not be a compound built on a face-down word, and a face-down word may not be a compound built on the clue: neither may start or end with the other (shorter word at least 3 letters). EAR rules out *earring* and *bear*, but not *heart*.
- The same holds after stripping one derivational prefix (en: *sub-, un-, re-, over-, trans-…*; de: *ver-, vor-, unter-, be-…*) from either word: ATOM rules out *subatomic*, HORSE rules out *unhorsed* (the rulebook's own example). This is stricter than the rulebook in places (it also rules out *inform* with FORM on the table), which is the safe side for a mechanical check.
- A clue may not share a simple inflection stem with a face-down word:
  - en: -s, -es, -ed, -ing, -er, -ies, -y
  - de: -e, -en, -n, -er, -es, -s, -ung, -chen, -lein, …
- Anything the engine can't catch (meaning-based rhymes, gestures) is up to the table.

## Table rules
- Spymasters can't use team chat. They can read it.
- **Timers** are optional and set in the lobby:
  - If the clue timer runs out, the turn passes with no clue (`clue-timeout`).
  - If the guess timer runs out, the turn ends (`guess-timeout`).
  - The guess timer runs once per turn, not once per guess.
  - Timers are never armed for AI seats.
