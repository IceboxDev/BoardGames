import { STATION_SIZE } from "./geometry";

/**
 * Simple house silhouette marking a research station. The path is drawn
 * around (0,0) so the parent CityNode places it via a translate to the
 * desired offset above the city dot. Stroked black-on-white so it reads
 * clearly against both light (yellow) and dark (red, black) city
 * backgrounds.
 */
export default function ResearchStation() {
  const s = STATION_SIZE;
  const halfWidth = s / 2;
  // Path: bottom-left, up to gable bottom, peak, gable bottom right, bottom-right, back.
  const d = `M ${-halfWidth} ${0} L ${-halfWidth} ${-s * 0.6} L 0 ${-s} L ${halfWidth} ${-s * 0.6} L ${halfWidth} ${0} Z`;
  // Decorative chrome rendered inside the focusable city <g>. Pointer
  // events are disabled so clicks fall through to the city itself.
  return (
    <g style={{ pointerEvents: "none" }}>
      <path d={d} fill="#ffffff" stroke="#0a0a0a" strokeWidth={1.5} strokeLinejoin="round" />
      {/* Tiny window slit so the silhouette doesn't read as a featureless block. */}
      <rect
        x={-s * 0.15}
        y={-s * 0.4}
        width={s * 0.3}
        height={s * 0.35}
        fill="#0a0a0a"
        opacity={0.6}
      />
    </g>
  );
}
