import type { MatchOutcomeTeams } from "@boardgames/core/history/types";
import { artsWedgeForScenario } from "../../../games/trivial-pursuit/palette";
import type { PickerUser } from "../ParticipantPicker";
import { withOptional } from "./shared";
import { TeamsForm } from "./TeamsForm";
import { WedgePicker } from "./WedgePicker";

type Props = {
  users: PickerUser[];
  value: MatchOutcomeTeams;
  onChange: (next: MatchOutcomeTeams) => void;
  gameSlug: string | null;
};

/**
 * Trivial Pursuit played in teams: the generic team builder, one shared pie
 * per team, and exactly one winning team — several teams can hold a full pie,
 * only one answered the final question.
 */
export function TrivialPursuitTeamsForm(props: Props) {
  return (
    <TeamsForm
      {...props}
      singleWinner
      renderTeamExtra={(team, idx, setTeam) => (
        <WedgePicker
          arts={artsWedgeForScenario(props.value.scenario)}
          owner={`Team ${idx + 1}`}
          wedges={team.wedges ?? []}
          onChange={(wedges) =>
            setTeam(withOptional(team, "wedges", wedges.length > 0 ? wedges : undefined))
          }
        />
      )}
    />
  );
}
