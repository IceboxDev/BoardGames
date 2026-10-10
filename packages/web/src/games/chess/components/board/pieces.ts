/**
 * Piece art: Colin M.L. Burnett's set ("cburnett", CC BY-SA 3.0), as served
 * by lichess. Credited on the chess rules page.
 */

import type { PieceChar } from "@boardgames/core/games/chess/engine/types";
import bB from "../../assets/pieces/bB.svg";
import bK from "../../assets/pieces/bK.svg";
import bN from "../../assets/pieces/bN.svg";
import bP from "../../assets/pieces/bP.svg";
import bQ from "../../assets/pieces/bQ.svg";
import bR from "../../assets/pieces/bR.svg";
import wB from "../../assets/pieces/wB.svg";
import wK from "../../assets/pieces/wK.svg";
import wN from "../../assets/pieces/wN.svg";
import wP from "../../assets/pieces/wP.svg";
import wQ from "../../assets/pieces/wQ.svg";
import wR from "../../assets/pieces/wR.svg";

export const PIECE_URL: Readonly<Record<PieceChar, string>> = {
  K: wK,
  Q: wQ,
  R: wR,
  B: wB,
  N: wN,
  P: wP,
  k: bK,
  q: bQ,
  r: bR,
  b: bB,
  n: bN,
  p: bP,
};

const NAMES: Readonly<Record<string, string>> = {
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn",
};

export function pieceName(piece: PieceChar): string {
  const color = piece === piece.toUpperCase() ? "white" : "black";
  return `${color} ${NAMES[piece.toLowerCase()] ?? "piece"}`;
}
