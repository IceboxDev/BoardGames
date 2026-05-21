interface Props {
  /** Number of coffee tokens currently held (0-3). The lab draws all three
   *  mug silhouettes; filled mugs are solid and empty mugs fade out. */
  count: number;
}

/**
 * Cabin-panel mug stack — 1 mug on top, 2 mugs on the bottom, right-triangle
 * arrangement. Matches `sky-team-lab/index.html:212-224` 1:1.
 */
export default function MugBlock({ count }: Props) {
  return (
    <div className="cockpit-mug-stack" role="img" aria-label={`Coffee ${count}/3`}>
      <div className="cockpit-mug-row">
        <Mug filled={count >= 1} />
      </div>
      <div className="cockpit-mug-row">
        <Mug filled={count >= 2} />
        <Mug filled={count >= 3} />
      </div>
    </div>
  );
}

function Mug({ filled }: { filled: boolean }) {
  return <span className={`cockpit-mug${filled ? "" : " cockpit-mug--off"}`}>+1</span>;
}
