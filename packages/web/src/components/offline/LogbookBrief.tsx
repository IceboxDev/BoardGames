import type {
  CommsRule,
  LogbookMission,
  TaskToken,
} from "../../games/the-crew-quest-for-planet-nine/logbook";

// The next mission's logbook entry on a Planet Nine campaign night: what the
// table sets up (task cards and tokens), how talking is limited, what the
// captain decides, and the mission's special rule — so nobody has to find the
// page before the first deal. Painted in the campaign's own ink.

const COMMS: Record<CommsRule, string> = {
  "dead-zone": "Dead zone",
  "from-trick-2": "Talk from trick 2",
  "from-trick-3": "Talk from trick 3",
};

/** Relative-order tokens print as chevrons (› before ››). */
const tokenGlyph = (t: TaskToken) => (t.startsWith(">") ? "›".repeat(t.length) : t);

const PILL =
  "campaign-chip-ink campaign-ink inline-flex h-6 items-center rounded-full px-2.5 text-2xs";

export function LogbookBrief({
  mission,
  partyCount,
}: {
  mission: LogbookMission;
  partyCount: number;
}) {
  const tasks =
    mission.tasks === null
      ? "No task cards"
      : `${mission.tasks} ${mission.tasks === 1 ? "task" : "tasks"}`;
  return (
    <section
      className="campaign-chip-ink campaign-rim flex flex-col gap-2 rounded-card-lg border p-2.5"
      aria-label={`Logbook, mission ${mission.n}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="campaign-tint inline-flex h-6 items-center rounded-full px-2.5 text-2xs font-bold">
          {tasks}
        </span>
        {mission.tokens?.map((t) => (
          <span
            key={t}
            title={t === "Ω" ? "Last task" : t.startsWith(">") ? "Relative order" : "Fixed order"}
            className="campaign-rim campaign-accent inline-flex h-6 min-w-6 items-center justify-center rounded-ui-md border px-1 font-mono text-2xs font-bold"
          >
            {tokenGlyph(t)}
          </span>
        ))}
        {mission.comms && <span className={PILL}>{COMMS[mission.comms]}</span>}
        {mission.captainDeals && (
          <span className={PILL}>
            {mission.captainDeals === "one" ? "Captain picks who takes them" : "Captain deals them"}
          </span>
        )}
        {mission.fivePlayerRule && partyCount === 5 && (
          <span className={PILL}>Five-player rule</span>
        )}
      </div>
      {mission.rule && (
        <p className="campaign-ink text-xs leading-relaxed opacity-85">{mission.rule}</p>
      )}
    </section>
  );
}
