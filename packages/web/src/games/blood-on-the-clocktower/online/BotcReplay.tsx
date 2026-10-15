import { BotcReplayLogSchema } from "@boardgames/core/games/blood-on-the-clocktower/online/state";
import { Button, ErrorAlert } from "../../../components/ui";
import type { ReplayProps } from "../../types";
import { type SquareSeat, TownSquare } from "./components/TownSquare";

/**
 * A finished online game: the Grimoire as it ended, laid on the square, and
 * the town's story beside it.
 */
export default function BotcReplay({ game, onBack }: ReplayProps) {
  const parsed = BotcReplayLogSchema.safeParse(game);
  if (!parsed.success) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <ErrorAlert message="This replay can't be read by this version of the page." />
      </div>
    );
  }
  const final = parsed.data.final;
  const grimoire = final.companion;
  const seats: SquareSeat[] =
    grimoire?.players.flatMap((p) =>
      p.roomSeat === undefined
        ? []
        : [
            {
              seat: p.roomSeat,
              name: p.name,
              alive: p.alive,
              ghostVote: p.ghostVote,
              left: p.left ?? false,
              connected: true,
              character: p.character,
              notes: p.believedCharacter ? ["thought otherwise"] : [],
            },
          ],
    ) ?? [];
  const phase = grimoire?.phase;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-fg-strong">
            {phase?.kind === "ended"
              ? phase.winner === "good"
                ? "Good won"
                : "Evil won"
              : "Unfinished"}
          </h2>
          {onBack && (
            <Button size="sm" variant="secondary" onClick={onBack}>
              Back
            </Button>
          )}
        </div>
        {phase?.kind === "ended" && <p className="text-sm text-fg-secondary">{phase.reason}</p>}
        <div className="flex aspect-square w-full">
          <TownSquare seats={seats} ariaLabel="The final Grimoire" />
        </div>
      </div>
      <ol className="flex w-full flex-col gap-1.5 lg:w-history-rail">
        {final.timeline.map((e) => (
          <li
            key={e.id}
            className={
              e.retracted ? "text-sm text-fg-disabled line-through" : "text-sm text-fg-primary"
            }
          >
            {e.text}
          </li>
        ))}
      </ol>
    </div>
  );
}
