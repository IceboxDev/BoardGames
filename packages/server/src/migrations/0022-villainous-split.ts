// Migration 0022 — Villainous becomes two games, one per physical box.
//
// Villainous used to be a single catalog game whose *edition* was recorded per
// match in `outcome.scenario` ("Introduction to Evil" | "The Worst Takes It
// All"). But the two editions are separate boxes seating different party sizes
// (2-4 vs 2-6), so ownership has to be per-box: who brings which box decides
// whether the night's group fits. They are now two catalog games in a
// `villainous` family, exactly like Codenames / Codenames: Duet / Pictures.
//
// This reclassifies existing history: a match tagged with the starter edition
// moves to the starter box's slug. The now-redundant `scenario` is stripped
// from both editions — the game slug names the box, so keeping the label would
// render a duplicate subtitle under the game title in MatchCard.
//
// `game_requests` rows keep pointing at `villainous` (the base box) — a vote is
// for "let's play Villainous", not for a box, and the base box is the canonical
// family member. `user_inventory` needs no migration: the starter slug was
// already the value stored there.
//
// Data-only; no schema change. Validated against prod via `migrate:dry-run`.

import type { Migration } from "./types.ts";

export const villainousSplit: Migration = {
  version: 22,
  name: "villainous_split",
  statements: [
    // Starter-edition matches move to the starter box and drop the label.
    `UPDATE match_results
        SET game_slug = 'villainous-introduction-to-evil',
            outcome_json = json_remove(outcome_json, '$.scenario')
      WHERE game_slug = 'villainous'
        AND json_extract(outcome_json, '$.scenario') = 'Introduction to Evil'`,
    // Base-edition matches stay on `villainous`; only the label goes.
    `UPDATE match_results
        SET outcome_json = json_remove(outcome_json, '$.scenario')
      WHERE game_slug = 'villainous'
        AND json_extract(outcome_json, '$.scenario') = 'The Worst Takes It All'`,
  ],
};
