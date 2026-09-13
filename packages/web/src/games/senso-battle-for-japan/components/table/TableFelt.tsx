import {
  TABLE_FELT_INSET,
  TABLE_FELT_VIGNETTE,
  TABLE_RIM,
  TABLE_RIM_EDGE,
  TABLE_SHADOW,
} from "../../colors";
import type { TableLayout } from "./table-geometry";

/** The oval cloth on its lacquered rim. Purely decorative. */
export default function TableFelt({ layout }: { layout: TableLayout }) {
  const { centre, felt, rim } = layout;
  return (
    <div aria-hidden="true" className="absolute inset-0">
      <div
        className="absolute rounded-full"
        style={{
          left: centre.x - felt.rx - rim,
          top: centre.y - felt.ry - rim,
          width: (felt.rx + rim) * 2,
          height: (felt.ry + rim) * 2,
          background: TABLE_RIM,
          border: `2px solid ${TABLE_RIM_EDGE}`,
          boxShadow: TABLE_SHADOW,
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          left: centre.x - felt.rx,
          top: centre.y - felt.ry,
          width: felt.rx * 2,
          height: felt.ry * 2,
          background: TABLE_FELT_VIGNETTE,
          boxShadow: TABLE_FELT_INSET,
        }}
      />
    </div>
  );
}
