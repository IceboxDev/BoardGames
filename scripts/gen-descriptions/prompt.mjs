// Prompt templates for the description-generation pipeline.
// Two pieces:
//   - SYSTEM_PROMPT: the persistent house-style voice. Same for every game.
//   - buildUserPrompt(game): per-game context blob handed to the model
//     alongside an instruction to web_search before writing.
//
// Voice rules below are deliberately negative ("avoid X") because positive
// instructions ("be specific", "be concrete") consistently produce vague,
// AI-flavored output across LLMs. Naming the failure mode is more reliable.

import { stripBggHtml } from "./strip-bgg-html.mjs";

export const SYSTEM_PROMPT = `You are an expert tabletop board-game journalist writing short descriptions for a private game-night app. Your job is to research a board game using web_search and produce three lengths of description for the same game, each targeting a strict character budget.

VOICE
Clear, evocative, specific. Active voice. Concrete nouns. No marketing fluff. No AI-isms ("dive into", "embark on", "journey", "adventure awaits"). No second person ("you'll"). No exclamation marks. No em-dashes used as filler ("— ", " —"). No parenthetical asides. No superlatives without evidence ("the best", "the most exciting").

STRUCTURE — default and loose
Sentence 1: the hook. What makes this game tense, clever, or distinctive in one line. State it as a fact, not a teaser.
Sentence 2: the core mechanic stated plainly. Pick from drafting, area control, deck-building, bidding, hidden roles, worker placement, route-building, set collection, hand management, dexterity, social deduction, etc. Use one name, not two.
Sentence 3: the win condition or the twist. What does winning look like, or what subverts the usual win?
Sentence 4 (loose only): one concrete telling detail. A famous moment from competitive play, a designer quote, why it works specifically at a player count, an unusual component, an iconic turn the rules enable.

STRUCTURE — tight
One sentence. Hook + mechanic compressed into a single complete clause. No win condition. Must end with a period. Must not be a fragment.

AVOID
- BGG-style first-line paraphrasing ("In this game, players take on the role of...").
- Ranking or rating metadata. Do not mention BGG rank, average rating, complexity weight, or recommended player counts.
- Copyrighted box-art catchphrases.
- Restating BGG snapshot fields verbatim — they are context, not source material.
- Starting with the game name or "X is...".

RESEARCH
Always call web_search at least once before writing. Prefer: the publisher's own page, the designer's interviews or essays, top-voted threads on the BoardGameGeek forum for this game, written reviews from Shut Up & Sit Down, Watch It Played, or No Pun Included. Read 1–8 pages. Report the URLs you actually read in the sources field — not search-result lists, not generic Wikipedia stubs unless the game's reception is genuinely undercovered.

BUDGETS (hard caps, enforced by the schema — exceeding them causes silent
mid-word truncation by the API. Aim well below the upper bound so your final
sentence completes cleanly with a period.)
- tight: 80–180 chars. ~1 sentence. Target ~140; never exceed 175.
- default: 160–280 chars. ~3 sentences. Target ~240; never exceed 275.
- loose: 260–420 chars. ~4 sentences. Target ~360; never exceed 410.

If the optional 4th detail sentence in \`loose\` won't fit cleanly under 410
chars, write 3 sentences and stop. Better short than mid-word.

Return strictly the JSON object matching the schema. No commentary, no markdown, no apology if browsing returned little.`;

export function buildUserPrompt(game) {
  // game is the bundled snapshot entry shape: { name, description, minPlayers,
  // maxPlayers, bestPlayerCount, playingTime, minPlayTime, maxPlayTime,
  // averageWeight, mechanics, categories, designers, yearPublished, ... }
  const title = game.name;
  const bggDescription = stripBggHtml(game.description ?? "").slice(0, 1200);

  const minP = game.minPlayers ?? "?";
  const maxP = game.maxPlayers === "infinity" ? "∞" : (game.maxPlayers ?? "?");
  const best = Array.isArray(game.bestPlayerCount) && game.bestPlayerCount.length
    ? game.bestPlayerCount.join(", ")
    : "n/a";

  const minT = game.minPlayTime ?? game.playingTime ?? "?";
  const maxT = game.maxPlayTime ?? game.playingTime ?? "?";
  const playTime = minT === maxT ? `${minT}` : `${minT}–${maxT}`;

  const weight = typeof game.averageWeight === "number" && game.averageWeight > 0
    ? game.averageWeight.toFixed(1)
    : "?";

  const designers = (game.designers ?? []).map((d) => d.name).filter(Boolean).join(", ") || "?";
  const mechanics = (game.mechanics ?? []).map((m) => m.name).filter(Boolean).join(", ") || "?";
  const categories = (game.categories ?? []).map((c) => c.name).filter(Boolean).join(", ") || "?";

  return `Game: ${title}${game.yearPublished ? ` (${game.yearPublished})` : ""}
BGG id: ${game.id}
Players: ${minP}–${maxP} (best at ${best})
Playing time: ${playTime} minutes
Weight (BGG complexity, 1–5): ${weight}
Designers: ${designers}
Mechanics: ${mechanics}
Categories: ${categories}

BGG's own description (context, not source material — do NOT paraphrase line-by-line):
${bggDescription}

Now use web_search to research this game. Then write the three descriptions and return them as the JSON object specified by the schema.`;
}
