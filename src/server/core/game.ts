import { redis } from '@devvit/web/server';
import {
  FIND_RADIUS,
  MAX_CLUE_LENGTH,
  TAPS_PER_DAY,
  type DigResponse,
  type FoundTreasure,
  type LeaderboardEntry,
  type PlayerDayState,
  type Point,
  type Treasure,
} from '../../shared/api';
import { dayKey, tomorrowKey } from '../../shared/dateUtil';

// ---------- Redis key helpers ----------
const kTreasures = (date: string) => `dig:treasures:${date}`;
const kPlayer = (date: string, user: string) => `dig:player:${date}:${user}`;
const kLeaderboard = (date: string) => `dig:lb:${date}`;
const kSeeded = (date: string) => `dig:seeded:${date}`;

// ---------- Seed treasures (cold-start, before any real buries exist) ----------
// These ship with the app so Day 1 in any new subreddit still has content.
// Each is intentionally vague but solvable; positions are normalized 0..1.
const SEED_TREASURES: ReadonlyArray<{ pos: Point; clue: string }> = [
  { pos: { x: 0.18, y: 0.62 }, clue: 'where the waves first kiss the sand' },
  { pos: { x: 0.74, y: 0.31 }, clue: 'high ground, watch the sunrise' },
  { pos: { x: 0.52, y: 0.50 }, clue: 'right under your nose' },
  { pos: { x: 0.32, y: 0.22 }, clue: 'past the lonely palm, before the cliff' },
  { pos: { x: 0.84, y: 0.78 }, clue: 'south-east of everything, near the wreck' },
  { pos: { x: 0.45, y: 0.82 }, clue: 'closer to the south shore than you think' },
];

const newId = (): string => Math.random().toString(36).slice(2, 10);

const clampUnit = (n: number): number => Math.max(0, Math.min(1, n));

const sanitizeClue = (raw: string): string => {
  const trimmed = (raw ?? '').toString().trim().replace(/\s+/g, ' ');
  return trimmed.slice(0, MAX_CLUE_LENGTH);
};

const distance = (a: Point, b: Point): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

// ---------- Treasure storage ----------
const readTreasures = async (date: string): Promise<Treasure[]> => {
  const raw = await redis.hGetAll(kTreasures(date));
  if (!raw) return [];
  return Object.values(raw).map((s) => JSON.parse(s) as Treasure);
};

const writeTreasure = async (date: string, t: Treasure): Promise<void> => {
  await redis.hSet(kTreasures(date), { [t.id]: JSON.stringify(t) });
};

const updateTreasure = async (date: string, t: Treasure): Promise<void> => {
  await writeTreasure(date, t);
};

const ensureSeeded = async (date: string): Promise<void> => {
  const already = await redis.get(kSeeded(date));
  if (already) return;
  // Mark as seeded first to avoid a double-seed race when many players load at once.
  await redis.set(kSeeded(date), '1');
  const existing = await readTreasures(date);
  if (existing.length > 0) return; // real buries already exist for this date
  for (const seed of SEED_TREASURES) {
    const t: Treasure = {
      id: newId(),
      pos: seed.pos,
      hider: 'GhostPirate',
      clue: seed.clue,
      foundBy: [],
    };
    await writeTreasure(date, t);
  }
};

// ---------- Player state ----------
const blankPlayerState = (): PlayerDayState => ({
  tapsUsed: 0,
  tapsLimit: TAPS_PER_DAY,
  found: [],
  hasBuried: false,
});

const readPlayer = async (
  date: string,
  user: string
): Promise<PlayerDayState> => {
  const raw = await redis.get(kPlayer(date, user));
  if (!raw) return blankPlayerState();
  try {
    const parsed = JSON.parse(raw) as PlayerDayState;
    // Defensive: keep tapsLimit in sync with current config in case it changes.
    return { ...parsed, tapsLimit: TAPS_PER_DAY };
  } catch {
    return blankPlayerState();
  }
};

const writePlayer = async (
  date: string,
  user: string,
  state: PlayerDayState
): Promise<void> => {
  await redis.set(kPlayer(date, user), JSON.stringify(state));
};

// ---------- Leaderboard ----------
// Composite score so more finds always wins, ties broken by fewer taps.
const leaderboardScore = (foundCount: number, tapsUsed: number): number =>
  foundCount * 10_000 - tapsUsed;

const updateLeaderboard = async (
  date: string,
  user: string,
  state: PlayerDayState
): Promise<void> => {
  await redis.zAdd(kLeaderboard(date), {
    member: user,
    score: leaderboardScore(state.found.length, state.tapsUsed),
  });
};

export const getLeaderboard = async (
  date: string,
  limit = 10
): Promise<LeaderboardEntry[]> => {
  // zRange returns ascending by default; we want descending (high score first).
  // Devvit's redis exposes zRange with by/order options; if unavailable, just
  // fetch a wider window and sort here.
  const members = await redis.zRange(kLeaderboard(date), 0, -1, {
    by: 'rank',
    reverse: true,
  });
  const top = members.slice(0, limit);
  const entries: LeaderboardEntry[] = [];
  for (const m of top) {
    const state = await readPlayer(date, m.member);
    entries.push({
      username: m.member,
      foundCount: state.found.length,
      tapsUsed: state.tapsUsed,
    });
  }
  return entries;
};

// ---------- Public game operations ----------
export const initToday = async (
  username: string
): Promise<{
  date: string;
  treasureCount: number;
  player: PlayerDayState;
}> => {
  const date = dayKey();
  await ensureSeeded(date);
  const [treasures, player] = await Promise.all([
    readTreasures(date),
    readPlayer(date, username),
  ]);
  return { date, treasureCount: treasures.length, player };
};

export const doDig = async (
  username: string,
  rawPos: Point
): Promise<DigResponse> => {
  const date = dayKey();
  await ensureSeeded(date);

  const player = await readPlayer(date, username);
  if (player.tapsUsed >= player.tapsLimit) {
    return { outcome: 'out_of_taps', player };
  }

  const pos: Point = { x: clampUnit(rawPos.x), y: clampUnit(rawPos.y) };
  const treasures = await readTreasures(date);

  // The player only competes for treasures they haven't already found.
  const foundIds = new Set(player.found.map((f) => f.id));
  const remaining = treasures.filter((t) => !foundIds.has(t.id));

  // Spend a tap.
  player.tapsUsed += 1;

  if (remaining.length === 0) {
    // Edge case: nothing left to find. Still spend the tap to keep it honest.
    await writePlayer(date, username, player);
    await updateLeaderboard(date, username, player);
    return { outcome: 'miss', nearest: 1, player };
  }

  // Nearest by Euclidean distance in normalized space.
  let nearest = remaining[0]!;
  let nearestDist = distance(pos, nearest.pos);
  for (let i = 1; i < remaining.length; i++) {
    const d = distance(pos, remaining[i]!.pos);
    if (d < nearestDist) {
      nearest = remaining[i]!;
      nearestDist = d;
    }
  }

  if (nearestDist <= FIND_RADIUS) {
    // Hit.
    const found: FoundTreasure = {
      id: nearest.id,
      pos: nearest.pos,
      hider: nearest.hider,
      clue: nearest.clue,
    };
    player.found.push(found);
    // Record the finder on the treasure itself (without duplicates).
    if (!nearest.foundBy.includes(username)) {
      nearest.foundBy.push(username);
      await updateTreasure(date, nearest);
    }
    await writePlayer(date, username, player);
    await updateLeaderboard(date, username, player);
    return { outcome: 'found', treasure: found, player };
  }

  await writePlayer(date, username, player);
  await updateLeaderboard(date, username, player);
  return { outcome: 'miss', nearest: nearestDist, player };
};

export type BuryResult =
  | { ok: true; message: string; player: PlayerDayState }
  | { ok: false; message: string; player: PlayerDayState };

export const doBury = async (
  username: string,
  rawPos: Point,
  rawClue: string
): Promise<BuryResult> => {
  const date = dayKey();
  const player = await readPlayer(date, username);

  if (player.hasBuried) {
    return {
      ok: false,
      message: "You've already buried a treasure today.",
      player,
    };
  }

  const clue = sanitizeClue(rawClue);
  if (clue.length === 0) {
    return {
      ok: false,
      message: 'Your clue needs at least a word or two.',
      player,
    };
  }

  const pos: Point = { x: clampUnit(rawPos.x), y: clampUnit(rawPos.y) };
  const target = tomorrowKey();
  const treasure: Treasure = {
    id: newId(),
    pos,
    hider: username,
    clue,
    foundBy: [],
  };
  await writeTreasure(target, treasure);

  player.hasBuried = true;
  await writePlayer(date, username, player);
  return {
    ok: true,
    message: 'Buried! Hunters will dig for it tomorrow.',
    player,
  };
};
