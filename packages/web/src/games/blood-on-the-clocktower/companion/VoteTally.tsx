import type { CompanionState } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import { nameAt, playerAt } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import {
  tallyVotes,
  type VoterStatus,
  voteOrder,
  voterStatus,
} from "@boardgames/core/games/blood-on-the-clocktower/voting";
import { Chip } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { CharacterIcon } from "./common";
import { useHandOver } from "./privacy-context";
import { Hint } from "./ui";

/**
 * The hand count, as the Storyteller runs it at the table: one chip per
 * player in the order hands are counted (clockwise from the nominee's left,
 * nominee last), so the phone can be read while pointing. Players who cannot
 * vote are greyed with the reason; each raised hand shows what it counts
 * for, and the total is computed from core's rules (ghost votes, Beggar
 * tokens, the Butler's master, ×3 / −1 marks, the Voudon).
 */
export function VoteTally({
  state,
  nominee,
  voters,
  onToggle,
}: {
  state: CompanionState;
  nominee: number;
  voters: number[];
  onToggle: (seat: number) => void;
}) {
  const handOver = useHandOver();
  const tally = tallyVotes(state, voters);
  const countedBy = new Map(tally.hands.map((h) => [h.seat, h.counted]));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {voteOrder(state, nominee).map((seat, i) => {
          const p = playerAt(state, seat);
          const label = voterLabel(state, voterStatus(state, seat), voters, handOver);
          const raised = voters.includes(seat);
          const counted = countedBy.get(seat);
          const caption = raised && counted !== undefined ? `counts ${counted}` : label.caption;
          return (
            <Chip
              key={seat}
              pressed={raised}
              tone="amber"
              size="md"
              block
              disabled={label.disabled}
              onClick={() => onToggle(seat)}
              className="min-h-11 justify-start"
              title={label.title}
            >
              <span className="flex min-w-0 items-center gap-1.5 text-left">
                {!handOver && <CharacterIcon character={p.character} size="sm" decorative />}
                <span className="flex min-w-0 flex-col items-start">
                  <span
                    className={cn("max-w-full truncate", !p.alive && "line-through opacity-60")}
                  >
                    {i + 1}. {p.name}
                  </span>
                  {caption && (
                    <span className="max-w-full truncate text-3xs font-normal opacity-70">
                      {caption}
                    </span>
                  )}
                </span>
              </span>
            </Chip>
          );
        })}
      </div>
      {tally.hands
        .filter((h) => h.status.kind === "butler" && h.counted === 0)
        .map((h) => (
          <Hint key={h.seat}>
            {nameAt(state, h.seat)} is the Butler — their hand only counts if{" "}
            {h.status.kind === "butler" ? nameAt(state, h.status.master) : "their master"} votes
            too.
          </Hint>
        ))}
    </div>
  );
}

function voterLabel(
  state: CompanionState,
  status: VoterStatus,
  voters: number[],
  handOver: boolean,
): { caption: string; title?: string; disabled: boolean } {
  // A player holding the phone may learn who is dead, never who is what.
  if (
    handOver &&
    status.kind !== "ghost" &&
    !(status.kind === "no-vote" && status.reason === "dead")
  ) {
    return { caption: "", disabled: status.kind === "no-vote" };
  }
  switch (status.kind) {
    case "alive":
      return {
        caption: status.weight === 3 ? "×3 (Bureaucrat)" : status.weight === -1 ? "−1 (Thief)" : "",
        disabled: false,
      };
    case "ghost":
      return { caption: "ghost vote — spends it", disabled: false };
    case "beggar":
      return {
        caption: `Beggar · ${status.tokens} token${status.tokens === 1 ? "" : "s"}`,
        disabled: false,
      };
    case "butler":
      return {
        caption: voters.includes(status.master)
          ? "Butler · master voted"
          : `Butler · needs ${nameAt(state, status.master)}`,
        disabled: false,
      };
    case "no-vote":
      return {
        caption:
          status.reason === "dead"
            ? "no vote (ghost vote spent)"
            : status.reason === "no-tokens"
              ? "Beggar · no token"
              : status.reason === "voudon"
                ? "Voudon: living don't vote"
                : "left town",
        title: "Cannot vote on this nomination",
        disabled: true,
      };
  }
}
