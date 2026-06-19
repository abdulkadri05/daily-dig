// Coordinates are normalized 0..1 across the island canvas so client and server
// agree on positions regardless of the rendered viewport size.
export type Point = { x: number; y: number };

export type Treasure = {
  id: string;
  pos: Point;
  hider: string;
  clue: string;
  foundBy: string[];
};

// What the player sees about a treasure they've found.
export type FoundTreasure = {
  id: string;
  pos: Point;
  hider: string;
  clue: string;
};

export type PlayerDayState = {
  tapsUsed: number;
  tapsLimit: number;
  found: FoundTreasure[];
  hasBuried: boolean;
};

export type LeaderboardEntry = {
  username: string;
  foundCount: number;
  tapsUsed: number;
};

export type InitGameResponse = {
  type: 'init';
  date: string; // YYYY-MM-DD (UTC)
  username: string;
  treasureCount: number; // how many treasures are buried today (for context)
  player: PlayerDayState;
  leaderboard: LeaderboardEntry[];
};

export type DigRequest = {
  pos: Point;
};

export type DigOutcomeFound = {
  outcome: 'found';
  treasure: FoundTreasure;
  player: PlayerDayState;
};

export type DigOutcomeMiss = {
  outcome: 'miss';
  // Distance to the nearest *unfound-by-this-player* treasure, 0..~1.4 (diagonal of a unit square).
  nearest: number;
  player: PlayerDayState;
};

export type DigOutcomeOutOfTaps = {
  outcome: 'out_of_taps';
  player: PlayerDayState;
};

export type DigResponse =
  | DigOutcomeFound
  | DigOutcomeMiss
  | DigOutcomeOutOfTaps;

export type BuryRequest = {
  pos: Point;
  clue: string;
};

export type BuryResponse = {
  type: 'bury';
  ok: boolean;
  message: string;
  player: PlayerDayState;
};

export type LeaderboardResponse = {
  type: 'leaderboard';
  date: string;
  entries: LeaderboardEntry[];
};

export type ErrorResponse = {
  status: 'error';
  message: string;
};

export const TAPS_PER_DAY = 20;
export const FIND_RADIUS = 0.04; // normalized; ~4% of canvas width
export const MAX_CLUE_LENGTH = 80;
