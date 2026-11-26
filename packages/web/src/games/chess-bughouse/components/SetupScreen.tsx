import type { TimeControl } from "@boardgames/core/games/chess/schemas";
import { bughouseManifest } from "@boardgames/core/games/chess-bughouse/manifest";
import { useState } from "react";
import { PvAISetupScreen } from "../../../components/setup/PvAISetupScreen";
import { SegmentedControl } from "../../../components/ui";
import { TimeControlPicker } from "../../chess/components/TimeControlPicker";

export interface BughouseSetup {
  readonly strategy: string;
  /** The seat you play: 0 = A-White, 1 = A-Black, 2 = B-White, 3 = B-Black. */
  readonly seat: number;
  readonly timeControl: TimeControl | null;
}

/** Solo bughouse: you plus three bots — a bot partner and two bot opponents. */
export default function SetupScreen({ onStart }: { onStart: (setup: BughouseSetup) => void }) {
  const [seat, setSeat] = useState(0);
  const [timeControl, setTimeControl] = useState<TimeControl | null>({
    initialMs: 180_000,
    incrementMs: 0,
  });
  return (
    <PvAISetupScreen
      title="Chess Bughouse"
      manifest={bughouseManifest}
      eyebrow="Solo · you + 3 AI on two boards"
      summary={({ strategy }) =>
        `${seat === 0 ? "Board A · White" : "Board A · Black"} · 3 × ${strategy?.label ?? ""}`
      }
      onStart={(_n, strategy) => onStart({ strategy, seat, timeControl })}
      options={[
        {
          id: "seat",
          label: "Your seat",
          span: "m",
          note: "Your partner is the bot on the other board, playing the other colour.",
          control: (
            <SegmentedControl<number>
              aria-label="Your seat"
              value={seat}
              onChange={setSeat}
              options={[
                { value: 0, label: "Board A · White" },
                { value: 1, label: "Board A · Black" },
              ]}
            />
          ),
        },
        {
          id: "time",
          label: "Time control",
          span: "l",
          control: <TimeControlPicker value={timeControl} onChange={setTimeControl} />,
        },
      ]}
    />
  );
}
