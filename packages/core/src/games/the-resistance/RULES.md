# The Resistance — rules as implemented

Base game plus the **Targeting** and **Blind Spies** variants, from the
consolidated rules (base + The Plot Thickens + Hidden Agenda + Hostile Intent,
v1.1). Plot Thickens and the character modules (Assassin, Trapper, Defector,
Rogue Agent, Sergeant, Inquisitor, Reverser, Hunter) are not implemented.

## Setup

| Players    | 5 | 6 | 7 | 8 | 9 | 10 |
|------------|---|---|---|---|---|----|
| Resistance | 3 | 4 | 4 | 5 | 6 | 6  |
| Spies      | 2 | 2 | 3 | 3 | 3 | 4  |

Roles are dealt at random (seeded). The first leader is random. In the base
game every spy knows every other spy; the Resistance knows nothing.

## A round

1. **Team building.** The leader proposes a team of the mission's size
   (below), themself optional. Everyone, leader included, votes Approve or
   Reject at once. A strict majority approves; a tie rejects.
   - Rejected: the lead passes clockwise and a new team is proposed.
   - The **fifth** rejected proposal in one round: the Spies win at once.
2. **Mission.** Each team member secretly plays Success or Fail. The
   Resistance **must** play Success; a spy may play either. Only the number of
   Fails is revealed — never who played them. One Fail sinks a mission, except
   **mission 4 at 7+ players, which needs two**.
3. The lead passes clockwise; the next round begins.

| Mission | 5 | 6 | 7 | 8 | 9 | 10 |
|---------|---|---|---|---|---|----|
| 1st     | 2 | 2 | 2 | 3 | 3 | 3  |
| 2nd     | 3 | 3 | 3 | 4 | 4 | 4  |
| 3rd     | 2 | 4 | 3 | 4 | 4 | 4  |
| 4th     | 3 | 3 | 4 | 5 | 5 | 5  |
| 5th     | 3 | 4 | 4 | 5 | 5 | 5  |

## End

- Three successful missions: the Resistance wins.
- Three failed missions, or five rejected proposals in one round: the Spies win.

## Variants

- **Targeting.** The leader chooses which unplayed mission the team is for
  (team size follows it). Mission 5 can't be chosen until two missions have
  succeeded.
- **Blind Spies.** No spy reveal: a spy knows only itself.

## Implementation notes

- Each proposal uses up one leadership, rejected or not, so the leader of the
  k-th proposal of the game is `(firstLeader + k) mod n` (`rules.ts:leaderOf`).
- Voting and missions are simultaneous: `getActivePlayer` is `-1`, bots submit
  the moment the phase opens and stay hidden until every person has.
- Player views never carry individual mission cards; roles appear only after
  the game. The replay log (`record.ts`) carries both.

## The Solver's model (`solver/`)

Exact inference over every set of spies (C(n, spies) ≤ 210 worlds). The game's
own rule (the Resistance only plays Success) is always hard. Behavioural
assumptions (`solver/assumptions.ts`) are each off / lean / always; a record
that breaks an "always" rule is re-read with that rule relaxed and the
contradiction is reported. Spies never coordinate their cards — they can't
agree at the table who plays Fail — so two spies on a team may double-fail;
the Solver blames the two-spy proposal, not the cards.
