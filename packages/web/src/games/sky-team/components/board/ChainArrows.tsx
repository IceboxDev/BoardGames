import { BoardLayer } from "../../../../components/board";

// Centers of the gap between consecutive flap/brake tiles. Y values are the
// midpoints between a tile's slider-bottom and the next tile's top:
//   flaps-1 slider ends y=509 → flaps-2 starts y=561 → mid y=535
//   flaps-2 slider ends y=659 → flaps-3 starts y=709 → mid y=684
//   flaps-3 slider ends y=807 → flaps-4 starts y=859 → mid y=833
const FLAP_ARROW_X = 677; // = STRIP_X_RIGHT (645) + tile_w/2 (32)
const FLAP_ARROW_YS = [535, 684, 833] as const;

const BRAKE_ARROW_Y = 810; // = BRAKE_ROW_Y (778) + tile_h/2 (32)
// Midpoints between adjacent brake tiles (centres 250/360/470, edges 282-328
// and 392-438 → midpoints 305 and 415).
const BRAKE_ARROW_XS = [305, 415] as const;

const TRI_HALF_BASE = 9;
const TRI_HEIGHT = 14;

/**
 * Chain arrows — small white triangles that sit between consecutive flap
 * tiles (vertical) and brake tiles (horizontal), signalling that each slot
 * is a prerequisite for the next one in the ordered chain.
 */
export default function ChainArrows() {
  return (
    <BoardLayer name="chain-arrows" z={3} aria-hidden>
      {FLAP_ARROW_YS.map((y) => (
        <polygon
          key={`flap-arrow-${y}`}
          points={`${FLAP_ARROW_X - TRI_HALF_BASE},${y - TRI_HEIGHT / 2} ${
            FLAP_ARROW_X + TRI_HALF_BASE
          },${y - TRI_HEIGHT / 2} ${FLAP_ARROW_X},${y + TRI_HEIGHT / 2}`}
          fill="white"
          opacity={0.95}
          style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}
        />
      ))}
      {BRAKE_ARROW_XS.map((x) => (
        <polygon
          key={`brake-arrow-${x}`}
          points={`${x - TRI_HEIGHT / 2},${BRAKE_ARROW_Y - TRI_HALF_BASE} ${
            x - TRI_HEIGHT / 2
          },${BRAKE_ARROW_Y + TRI_HALF_BASE} ${x + TRI_HEIGHT / 2},${BRAKE_ARROW_Y}`}
          fill="white"
          opacity={0.95}
          style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}
        />
      ))}
    </BoardLayer>
  );
}
