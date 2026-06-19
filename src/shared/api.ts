// Take Sides shared types — contract between client and server.

export type Side = 'left' | 'right';

export type DailyPrompt = {
  date: string; // YYYY-MM-DD (UTC)
  question: string;
  leftLabel: string;
  rightLabel: string;
};

export type Argument = {
  id: string;
  author: string;
  side: Side;
  text: string;
  upvotes: number; // number of upvotes from other players
  createdAt: number; // ms epoch
};

export type SideTally = {
  side: Side;
  label: string;
  count: number; // arguments on this side
  power: number; // sum of (1 + upvotes) for each argument on this side
};

export type Tally = {
  left: SideTally;
  right: SideTally;
  // pull is in [-1, 1] — negative means left is winning, positive means right.
  pull: number;
};

export type PlayerState = {
  hasSubmitted: boolean;
  side: Side | null;
  argumentId: string | null;
  upvotedArgIds: string[];
  streak: number; // consecutive days the player has participated, incl. today
};

export type YesterdayResult = {
  date: string;
  question: string;
  leftLabel: string;
  rightLabel: string;
  winnerSide: Side | 'tie' | null; // null if no one played yesterday
  winnerLabel: string | null;
  leftPower: number;
  rightPower: number;
  mvpAuthor: string | null;
  mvpText: string | null;
  mvpUpvotes: number;
};

export type InitResponse = {
  type: 'init';
  username: string;
  prompt: DailyPrompt;
  tally: Tally;
  args: Argument[]; // capped at TOP_ARGUMENTS for payload size
  player: PlayerState;
  yesterday: YesterdayResult | null;
  playerCount: number; // distinct players who picked a side today
};

export type SubmitRequest = {
  side: Side;
  text: string;
};

export type SubmitResponse = {
  type: 'submit';
  ok: boolean;
  message: string;
  player: PlayerState;
  argument?: Argument;
  tally: Tally;
};

export type UpvoteRequest = {
  argumentId: string;
};

export type UpvoteResponse = {
  type: 'upvote';
  ok: boolean;
  message: string;
  argument?: Argument;
  player: PlayerState;
  tally: Tally;
};

export type ErrorResponse = {
  status: 'error';
  message: string;
};

export const MAX_ARG_LENGTH = 140;
export const TOP_ARGUMENTS = 60; // most we return to client per fetch
