import { useState } from "react";
import { MatchHistory } from "../../../components/match-history";
import { Button } from "../../../components/ui/Button";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { useSetHistory } from "../hooks/useSetHistory";
import HighScores from "./HighScores";

type HistoryTab = "trainer" | "pvp";

/**
 * Custom `/play/set/match-history` view. Set has two distinct
 * histories — the local trainer's `useSetHistory` (a client-side
 * localStorage record of speed-practice runs) and the server-side PvP
 * match history. The generic `<MatchHistory>` component covers only the
 * PvP side, so this component wraps both behind a tab toggle so users
 * can switch between them without leaving the route.
 *
 * Wired into the registry via `def.matchHistoryComponent`; the route
 * supplies the `onBack` callback that navigates back to mode select.
 */
export default function SetMatchHistory({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<HistoryTab>("trainer");
  const { history: trainerHistory, clear: clearTrainer } = useSetHistory();

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Match History</h2>
        <Button variant="secondary" size="md" onClick={onBack}>
          Back
        </Button>
      </div>

      <SegmentedControl<HistoryTab>
        selectionMode="tabs"
        aria-label="History type"
        options={[
          { value: "trainer", label: "Trainer" },
          { value: "pvp", label: "PvP" },
        ]}
        value={tab}
        onChange={setTab}
        className="mb-6"
      />

      {tab === "trainer" ? (
        <HighScores history={trainerHistory} onClear={clearTrainer} onBack={onBack} />
      ) : (
        <MatchHistory gameSlug="set" labelResolver={() => "Human"} onBack={onBack} />
      )}
    </div>
  );
}
