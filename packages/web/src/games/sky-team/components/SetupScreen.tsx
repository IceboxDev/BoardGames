import { useState } from "react";

export interface SkyTeamStartConfig {
  scenarioId: string;
  humanPlayers: number[];
  aiStrategy: string;
}

interface Props {
  onStart: (config: SkyTeamStartConfig) => void;
}

const SCENARIOS = [{ id: "yul-montreal", name: "YUL Montréal-Trudeau", note: "Base game" }];

const SEAT_OPTIONS: { id: 0 | 1; label: string; description: string }[] = [
  { id: 0, label: "Pilot", description: "Blue side; places first each round." },
  { id: 1, label: "Co-Pilot", description: "Orange side; deploys flaps." },
];

export default function SetupScreen({ onStart }: Props) {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [seat, setSeat] = useState<0 | 1>(0);

  const start = () => {
    const humanPlayers = [seat];
    onStart({ scenarioId, humanPlayers, aiStrategy: "heuristic-v1" });
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 p-4">
      <h2 className="text-2xl font-bold text-sky-200">Sky Team — Solo</h2>
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Scenario</h3>
        <div className="grid grid-cols-1 gap-2">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScenarioId(s.id)}
              className={[
                "flex flex-col items-start gap-0.5 rounded-md border-2 p-3 text-left",
                scenarioId === s.id
                  ? "border-sky-400 bg-sky-900/40"
                  : "border-slate-700 bg-slate-900 hover:border-slate-500",
              ].join(" ")}
            >
              <span className="text-sm font-semibold text-slate-100">{s.name}</span>
              <span className="text-xs text-slate-400">{s.note}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          Your seat (AI takes the other)
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {SEAT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSeat(opt.id)}
              className={[
                "flex flex-col items-start gap-0.5 rounded-md border-2 p-3 text-left",
                seat === opt.id
                  ? opt.id === 0
                    ? "border-sky-400 bg-sky-900/40"
                    : "border-orange-400 bg-orange-900/40"
                  : "border-slate-700 bg-slate-900 hover:border-slate-500",
              ].join(" ")}
            >
              <span className="text-sm font-semibold">{opt.label}</span>
              <span className="text-xs text-slate-400">{opt.description}</span>
            </button>
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={start}
        className="self-start rounded-md bg-emerald-600 px-6 py-2 text-base font-bold text-white shadow hover:bg-emerald-500"
      >
        Start flight
      </button>
    </div>
  );
}
