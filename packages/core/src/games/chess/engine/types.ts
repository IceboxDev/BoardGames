/**
 * The chess rules engine's data. Everything here is plain JSON so a position
 * can sit in machine context, travel to the browser and land in a replay log
 * unchanged.
 *
 * Squares are 0–63 with a1 = 0, b1 = 1 … h8 = 63 (`rank * 8 + file`).
 */

export type Color = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

/** FEN letters: upper case is White, lower case Black. */
export type PieceChar = "P" | "N" | "B" | "R" | "Q" | "K" | "p" | "n" | "b" | "r" | "q" | "k";

/** Pieces that can be promoted to. */
export type PromotionType = "q" | "r" | "b" | "n";

/** Pieces that can sit in a bughouse pocket (a king never can). */
export type PocketType = "p" | "n" | "b" | "r" | "q";

export type Square = number;

export interface CastlingRights {
  /** White king side. */
  readonly K: boolean;
  /** White queen side. */
  readonly Q: boolean;
  readonly k: boolean;
  readonly q: boolean;
}

export type PocketCounts = Readonly<Record<PocketType, number>>;
export type Pockets = Readonly<Record<Color, PocketCounts>>;

export interface Position {
  /** `board[square]` — a FEN piece letter, or `null` for an empty square. */
  readonly board: readonly (PieceChar | null)[];
  readonly turn: Color;
  readonly castling: CastlingRights;
  /** The square a pawn just skipped over (FEN's en-passant target), or `null`. */
  readonly ep: Square | null;
  /** Plies since the last capture or pawn move (the 50-move counter). */
  readonly halfmove: number;
  readonly fullmove: number;
  /** Bughouse: the pieces each side may drop. `null` in classical chess. */
  readonly pockets: Pockets | null;
  /**
   * Bughouse: squares holding promoted pieces, which go back to the pocket
   * as pawns when captured. Sorted. `null` in classical chess.
   */
  readonly promoted: readonly Square[] | null;
}

/** A board move or (bughouse) a drop from the pocket. */
export type Move =
  | {
      readonly from: Square;
      readonly to: Square;
      readonly promotion?: PromotionType;
      readonly drop?: undefined;
    }
  | { readonly drop: PocketType; readonly to: Square; readonly from?: undefined };

/** What a move did, beyond the new position — for SAN, sounds and pockets. */
export interface MoveEffects {
  readonly position: Position;
  /**
   * The captured piece's type, or `null`. A promoted piece reports `"p"`
   * (bughouse passes it to the partner as a pawn).
   */
  readonly captured: PieceType | null;
  readonly castle: "k" | "q" | null;
  readonly enPassant: boolean;
}
