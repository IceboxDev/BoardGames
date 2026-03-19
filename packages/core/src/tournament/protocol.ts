export interface TournamentProgress<TPartial = void> {
  kind: "progress";
  completed: number;
  total: number;
  partial: TPartial;
}

export interface TournamentComplete<TResult> {
  kind: "complete";
  result: TResult;
}

export interface TournamentAbort {
  kind: "abort";
}

export type TournamentOutbound<TPartial, TResult> =
  | TournamentProgress<TPartial>
  | TournamentComplete<TResult>;
