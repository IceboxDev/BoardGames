import { Surface } from "../../../components/ui";
import { cn } from "../../../lib/cn";

const NIGHTS = 15;

/**
 * How far the night has gone: fifteen moons waning from full to a sliver as
 * dawn comes, over a sky that warms toward sunrise at the right. Past nights
 * are spent silver, tonight glows, the rest wait in outline. Night 16 is the
 * Parasol turn — the sun is already up.
 */
export default function NightTrack({ turn }: { turn: number }) {
  const parasol = turn > NIGHTS;
  const night = Math.min(turn, NIGHTS);
  const left = NIGHTS - night;
  return (
    <Surface
      variant="raised"
      padding="md"
      className="flex shrink-0 flex-col gap-3 overflow-hidden"
      style={{
        background: "linear-gradient(100deg, #0d0b1c 0%, #15112a 45%, #2a1626 80%, #4a2322 100%)",
      }}
      aria-label={parasol ? "Parasol turn: the sun has risen" : `Night ${night} of ${NIGHTS}`}
    >
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span
            className="text-4xl leading-none text-amber-100"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            {parasol ? "Dawn" : night}
          </span>
          <span className="text-xs text-fg-secondary">
            {parasol ? "Parasol turn" : `night of ${NIGHTS}`}
          </span>
        </div>
        <span className="text-right text-2xs text-fg-muted">
          {parasol
            ? "Only Parasols may act"
            : left === 0
              ? "Sunrise after this night"
              : `${left} more before sunrise`}
        </span>
      </div>

      <ol className="flex items-center justify-between gap-0.5" aria-hidden>
        {Array.from({ length: NIGHTS }, (_, i) => i + 1).map((n) => (
          <li key={n} className="flex flex-1 justify-center">
            <Moon n={n} state={parasol || n < turn ? "past" : n === turn ? "now" : "future"} />
          </li>
        ))}
        <li className="flex justify-center pl-1">
          <span
            className="h-2.5 w-5 rounded-t-full"
            style={{
              background: "radial-gradient(circle at 50% 100%, #fde68a, #f97316 60%, #9a3412)",
              boxShadow: parasol ? "0 0 14px 3px rgb(249 115 22 / 0.6)" : "none",
              opacity: parasol || left <= 2 ? 1 : 0.55,
            }}
            title="Sunrise"
          />
        </li>
      </ol>
    </Surface>
  );
}

/** One night's moon, waning with the night number. */
function Moon({ n, state }: { n: number; state: "past" | "now" | "future" }) {
  // Lit fraction: a full moon on night 1, a thin crescent by night 15.
  const lit = 1 - ((n - 1) / (NIGHTS - 1)) * 0.82;
  const size = state === "now" ? 18 : 12;
  const shadow = Math.round((1 - lit) * size);
  const face = state === "now" ? "#fde68a" : state === "past" ? "#8f86a3" : "transparent";
  return (
    <span
      className={cn(
        "block shrink-0 rounded-full transition-all",
        state === "future" && "ring-1 ring-line-strong",
      )}
      style={{
        width: size,
        height: size,
        background: face,
        boxShadow: [
          state === "future" ? "" : `inset ${-shadow}px 0 0 0 #120f22`,
          state === "now" ? "0 0 12px 2px rgb(253 230 138 / 0.55)" : "",
        ]
          .filter(Boolean)
          .join(", "),
        opacity: state === "past" ? 0.7 : 1,
      }}
    />
  );
}
