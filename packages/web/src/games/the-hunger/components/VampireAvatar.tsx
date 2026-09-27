import { cn } from "../../../lib/cn";
import { vampireArt, vampireFace } from "../logic/art";
import { vampireColor, vampireName } from "../logic/labels";

/** How far the portrait is enlarged inside the circle, so the face fills it. */
const ZOOM = 2.3;
/** The portraits are 4:5. */
const ASPECT = 5 / 4;

/**
 * A Vampire's face in a round frame ringed in their seat colour — cropped
 * from their portrait, or the seat colour and a bat until it is generated.
 */
export default function VampireAvatar({
  vampire,
  className,
  dim = false,
}: {
  vampire: number;
  /** Size and extra ring classes, e.g. `h-16 w-16`. */
  className?: string;
  dim?: boolean;
}) {
  const url = vampireArt(vampire, "bust");
  const face = vampireFace(vampire);
  const color = vampireColor(vampire);
  return (
    <span
      className={cn(
        "relative inline-block shrink-0 overflow-hidden rounded-full shadow-lg",
        dim && "opacity-60 grayscale",
        className,
      )}
      style={{
        background: `radial-gradient(circle at 35% 30%, ${color}, #140d18)`,
        boxShadow: `0 0 0 2px ${color}, 0 4px 12px rgb(0 0 0 / 0.5)`,
      }}
      title={vampireName(vampire)}
    >
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          className="absolute max-w-none select-none"
          style={{
            width: `${ZOOM * 100}%`,
            left: `${50 - face.x * ZOOM * 100}%`,
            top: `${50 - face.y * ZOOM * ASPECT * 100}%`,
          }}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center" aria-hidden>
          🦇
        </span>
      )}
    </span>
  );
}
