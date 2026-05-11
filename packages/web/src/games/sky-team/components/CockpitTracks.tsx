import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";

interface Props {
  view: SkyTeamPlayerView;
}

export default function CockpitTracks({ view }: Props) {
  return (
    <div className="flex flex-col gap-3 rounded-md border-2 border-slate-700 bg-slate-950/70 p-3">
      <ApproachTrack view={view} />
      <SpeedGauge view={view} />
      <BrakeTrack view={view} />
      <AxisIndicator view={view} />
      <AltitudeReadout view={view} />
    </div>
  );
}

function ApproachTrack({ view }: Props) {
  const total = view.approach.airliners.length;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
        <span>Approach corridor</span>
        <span className="text-slate-500">
          {view.approach.current}/{view.approach.airportIndex}
        </span>
      </div>
      <div className="flex gap-1 overflow-x-auto">
        {Array.from({ length: total }, (_, i) => {
          const isPlane = view.approach.current === i;
          const isAirport = view.approach.airportIndex === i;
          const airliners = view.approach.airliners[i] ?? 0;
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: approach corridor positions are stable indexed slots
              key={`space-${i}`}
              className={[
                "relative flex h-14 w-11 shrink-0 flex-col items-center justify-center rounded border text-[10px]",
                isAirport
                  ? "border-emerald-400 bg-emerald-950"
                  : isPlane
                    ? "border-yellow-300 bg-slate-800"
                    : "border-slate-700 bg-slate-900",
              ].join(" ")}
            >
              {isPlane ? (
                <span className="text-xl leading-none text-yellow-300">✈</span>
              ) : airliners > 0 ? (
                <span className="text-red-400 leading-tight">
                  <span className="block text-base">✈</span>
                  <span className="text-[9px]">×{airliners}</span>
                </span>
              ) : !isAirport ? (
                <span className="text-slate-700">·</span>
              ) : null}
              {isAirport ? (
                <span className="text-[9px] font-bold text-emerald-300">YUL</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SpeedGauge({ view }: Props) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">Speed Gauge</div>
      <div className="flex gap-1">
        {Array.from({ length: 16 }, (_, i) => {
          const v = i + 1;
          const blueAt = v === view.speedGauge.bluePos + 1;
          const orangeAt = v === view.speedGauge.orangePos + 1;
          return (
            <div
              key={`speed-${v}`}
              className={[
                "flex h-6 w-5 items-center justify-center rounded-sm border text-[9px]",
                blueAt
                  ? "border-sky-400 bg-sky-700 text-white"
                  : orangeAt
                    ? "border-orange-400 bg-orange-700 text-white"
                    : "border-slate-700 bg-slate-900 text-slate-500",
              ].join(" ")}
            >
              {v}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BrakeTrack({ view }: Props) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">Brakes</div>
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((p) => (
          <div
            key={p}
            className={[
              "flex h-6 w-8 items-center justify-center rounded-sm border text-[10px]",
              view.brakeTrack.pos === p
                ? "border-red-400 bg-red-800 text-white"
                : "border-slate-700 bg-slate-900 text-slate-500",
            ].join(" ")}
          >
            {p === 0 ? "—" : p * 2}
          </div>
        ))}
      </div>
    </div>
  );
}

function AxisIndicator({ view }: Props) {
  const max = view.axis.spinAt;
  const positions = [];
  for (let i = -max; i <= max; i++) positions.push(i);
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">Axis</div>
      <div className="flex gap-0.5">
        {positions.map((p) => {
          const isHere = view.axis.position === p;
          const isSpin = Math.abs(p) === max;
          return (
            <div
              key={p}
              className={[
                "flex h-5 w-5 items-center justify-center rounded text-[9px]",
                isHere
                  ? "bg-yellow-400 text-slate-900 font-bold"
                  : isSpin
                    ? "bg-red-900 text-red-300"
                    : p === 0
                      ? "bg-emerald-900 text-emerald-300"
                      : "bg-slate-800 text-slate-500",
              ].join(" ")}
            >
              {p}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AltitudeReadout({ view }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-3">
        <div>
          <span className="text-slate-400">Altitude</span>{" "}
          <span className="font-mono text-emerald-300">{view.altitude.feet} ft</span>
        </div>
        <div>
          <span className="text-slate-400">Round</span>{" "}
          <span className="font-mono">
            {view.round}/{view.scenario.totalRounds}
          </span>
        </div>
        <div>
          <span className="text-slate-400">Scenario</span>{" "}
          <span className="font-mono">{view.scenario.name}</span>
        </div>
      </div>
      {view.isFinalRound ? (
        <span className="rounded bg-amber-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-100">
          Final Approach
        </span>
      ) : null}
    </div>
  );
}
