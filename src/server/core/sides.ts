import { redis } from '@devvit/web/server';
import {
  MAX_ARG_LENGTH,
  TOP_ARGUMENTS,
  type Argument,
  type DailyPrompt,
  type PlayerState,
  type Side,
  type SideTally,
  type Tally,
  type YesterdayResult,
} from '../../shared/api';
import { dayKey, yesterdayKey } from '../../shared/dateUtil';
import { pickPrompt } from '../../shared/prompts';

// ---------- Redis keys ----------
const kArgs = (date: string) => `ts:args:${date}`; // hash argId -> JSON
const kPlayer = (date: string, user: string) => `ts:player:${date}:${user}`;
const kPromptCache = (date: string) => `ts:prompt:${date}`;
const kStreak = (user: string) => `ts:streak:${user}`;
const kPlayers = (date: string) => `ts:players:${date}`; // set of usernames who submitted

// ---------- Helpers ----------
const newId = (): string => Math.random().toString(36).slice(2, 10);

const sanitizeText = (raw: string): string => {
  const s = (raw ?? '').toString().trim().replace(/\s+/g, ' ');
  return s.slice(0, MAX_ARG_LENGTH);
};

const validSide = (s: unknown): s is Side => s === 'left' || s === 'right';

// ---------- Prompt ----------
const buildPromptFor = (date: string): DailyPrompt => {
  const seed = pickPrompt(date);
  return {
    date,
    question: seed.question,
    leftLabel: seed.leftLabel,
    rightLabel: seed.rightLabel,
  };
};

export const getPrompt = async (): Promise<DailyPrompt> => {
  const date = dayKey();
  const cached = await redis.get(kPromptCache(date));
  if (cached) {
    try {
      return JSON.parse(cached) as DailyPrompt;
    } catch {
      // fall through and rebuild
    }
  }
  const prompt = buildPromptFor(date);
  await redis.set(kPromptCache(date), JSON.stringify(prompt));
  return prompt;
};

// ---------- Argument storage ----------
const readAllArgs = async (date: string): Promise<Argument[]> => {
  const raw = await redis.hGetAll(kArgs(date));
  if (!raw) return [];
  const out: Argument[] = [];
  for (const v of Object.values(raw)) {
    try {
      out.push(JSON.parse(v) as Argument);
    } catch {
      /* skip */
    }
  }
  return out;
};

const writeArg = async (date: string, arg: Argument): Promise<void> => {
  await redis.hSet(kArgs(date), { [arg.id]: JSON.stringify(arg) });
};

const readArg = async (
  date: string,
  argId: string
): Promise<Argument | null> => {
  const raw = await redis.hGet(kArgs(date), argId);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Argument;
  } catch {
    return null;
  }
};

// ---------- Player state ----------
const blankPlayer = (): PlayerState => ({
  hasSubmitted: false,
  side: null,
  argumentId: null,
  upvotedArgIds: [],
  streak: 0,
});

const readPlayer = async (
  date: string,
  user: string
): Promise<PlayerState> => {
  const raw = await redis.get(kPlayer(date, user));
  if (!raw) {
    // Backfill streak from the dedicated key so returning players keep their run.
    const streak = await readStreak(user);
    return { ...blankPlayer(), streak };
  }
  try {
    return JSON.parse(raw) as PlayerState;
  } catch {
    return blankPlayer();
  }
};

const writePlayer = async (
  date: string,
  user: string,
  state: PlayerState
): Promise<void> => {
  await redis.set(kPlayer(date, user), JSON.stringify(state));
};

// ---------- Streak ----------
type StreakRecord = { lastDate: string; count: number };

const readStreakRaw = async (user: string): Promise<StreakRecord | null> => {
  const raw = await redis.get(kStreak(user));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StreakRecord;
  } catch {
    return null;
  }
};

const readStreak = async (user: string): Promise<number> => {
  const rec = await readStreakRaw(user);
  if (!rec) return 0;
  // If the player hasn't played yesterday or today, the live streak is broken
  // even though we haven't reset the stored value yet.
  const today = dayKey();
  const yest = yesterdayKey();
  if (rec.lastDate === today || rec.lastDate === yest) return rec.count;
  return 0;
};

const bumpStreak = async (user: string): Promise<number> => {
  const today = dayKey();
  const yest = yesterdayKey();
  const rec = await readStreakRaw(user);
  let nextCount = 1;
  if (rec) {
    if (rec.lastDate === today) {
      nextCount = rec.count; // already counted today
    } else if (rec.lastDate === yest) {
      nextCount = rec.count + 1;
    } else {
      nextCount = 1;
    }
  }
  const next: StreakRecord = { lastDate: today, count: nextCount };
  await redis.set(kStreak(user), JSON.stringify(next));
  return nextCount;
};

// ---------- Player roster (for live player count) ----------
// Devvit Redis has no Set commands, so we use a hash as a unique-membership
// store: presence-of-field = "this user played today", count = hLen.
const recordPlayer = async (date: string, user: string): Promise<void> => {
  await redis.hSet(kPlayers(date), { [user]: '1' });
};

const playerCountFor = async (date: string): Promise<number> => {
  const n = await redis.hLen(kPlayers(date));
  return typeof n === 'number' ? n : 0;
};

// ---------- Tally + ranking ----------
const argPower = (a: Argument): number => 1 + a.upvotes;

const computeTally = (
  args: Argument[],
  prompt: DailyPrompt
): { tally: Tally; argsSorted: Argument[] } => {
  let lCount = 0;
  let rCount = 0;
  let lPower = 0;
  let rPower = 0;
  for (const a of args) {
    if (a.side === 'left') {
      lCount += 1;
      lPower += argPower(a);
    } else {
      rCount += 1;
      rPower += argPower(a);
    }
  }
  const total = lPower + rPower;
  const pull = total === 0 ? 0 : (rPower - lPower) / total;
  const left: SideTally = {
    side: 'left',
    label: prompt.leftLabel,
    count: lCount,
    power: lPower,
  };
  const right: SideTally = {
    side: 'right',
    label: prompt.rightLabel,
    count: rCount,
    power: rPower,
  };
  const argsSorted = [...args].sort((a, b) => {
    const dp = argPower(b) - argPower(a);
    if (dp !== 0) return dp;
    return b.createdAt - a.createdAt;
  });
  return { tally: { left, right, pull }, argsSorted };
};

// ---------- Yesterday's result ----------
export const getYesterdayResult = async (): Promise<YesterdayResult | null> => {
  const date = yesterdayKey();
  const prompt = buildPromptFor(date);
  const args = await readAllArgs(date);
  if (args.length === 0) {
    return {
      date,
      question: prompt.question,
      leftLabel: prompt.leftLabel,
      rightLabel: prompt.rightLabel,
      winnerSide: null,
      winnerLabel: null,
      leftPower: 0,
      rightPower: 0,
      mvpAuthor: null,
      mvpText: null,
      mvpUpvotes: 0,
    };
  }
  const { tally, argsSorted } = computeTally(args, prompt);
  let winnerSide: Side | 'tie';
  let winnerLabel: string;
  if (tally.left.power === tally.right.power) {
    winnerSide = 'tie';
    winnerLabel = 'Tie';
  } else if (tally.left.power > tally.right.power) {
    winnerSide = 'left';
    winnerLabel = prompt.leftLabel;
  } else {
    winnerSide = 'right';
    winnerLabel = prompt.rightLabel;
  }
  // MVP = highest-upvote argument on the winning side (or overall, on tie).
  let mvpCandidates: Argument[] = argsSorted;
  if (winnerSide !== 'tie') {
    const onWinningSide = argsSorted.filter((a) => a.side === winnerSide);
    if (onWinningSide.length > 0) mvpCandidates = onWinningSide;
  }
  const mvp = mvpCandidates[0]!;
  return {
    date,
    question: prompt.question,
    leftLabel: prompt.leftLabel,
    rightLabel: prompt.rightLabel,
    winnerSide,
    winnerLabel,
    leftPower: tally.left.power,
    rightPower: tally.right.power,
    mvpAuthor: mvp.author,
    mvpText: mvp.text,
    mvpUpvotes: mvp.upvotes,
  };
};

// ---------- Public ops ----------
export const initState = async (
  username: string
): Promise<{
  prompt: DailyPrompt;
  tally: Tally;
  args: Argument[];
  player: PlayerState;
  yesterday: YesterdayResult | null;
  playerCount: number;
}> => {
  const prompt = await getPrompt();
  const [args, player, yesterday, playerCount] = await Promise.all([
    readAllArgs(prompt.date),
    readPlayer(prompt.date, username),
    getYesterdayResult(),
    playerCountFor(prompt.date),
  ]);
  const { tally, argsSorted } = computeTally(args, prompt);
  return {
    prompt,
    tally,
    args: argsSorted.slice(0, TOP_ARGUMENTS),
    player,
    yesterday,
    playerCount,
  };
};

export type SubmitResult = {
  ok: boolean;
  message: string;
  player: PlayerState;
  argument?: Argument;
  tally: Tally;
};

export const submitArgument = async (
  username: string,
  rawSide: unknown,
  rawText: unknown
): Promise<SubmitResult> => {
  const prompt = await getPrompt();
  const date = prompt.date;
  const player = await readPlayer(date, username);
  const args = await readAllArgs(date);

  if (player.hasSubmitted) {
    const { tally } = computeTally(args, prompt);
    return {
      ok: false,
      message: 'You already picked a side today.',
      player,
      tally,
    };
  }
  if (!validSide(rawSide)) {
    const { tally } = computeTally(args, prompt);
    return {
      ok: false,
      message: 'Pick a side first.',
      player,
      tally,
    };
  }
  const text = sanitizeText(String(rawText ?? ''));
  if (text.length === 0) {
    const { tally } = computeTally(args, prompt);
    return {
      ok: false,
      message: 'Your argument needs at least a word.',
      player,
      tally,
    };
  }

  const argument: Argument = {
    id: newId(),
    author: username,
    side: rawSide,
    text,
    upvotes: 0,
    createdAt: Date.now(),
  };
  await writeArg(date, argument);
  await recordPlayer(date, username);
  const streak = await bumpStreak(username);

  const newPlayer: PlayerState = {
    hasSubmitted: true,
    side: rawSide,
    argumentId: argument.id,
    upvotedArgIds: player.upvotedArgIds,
    streak,
  };
  await writePlayer(date, username, newPlayer);

  const updatedArgs = [...args, argument];
  const { tally } = computeTally(updatedArgs, prompt);
  return {
    ok: true,
    message: 'On the rope!',
    player: newPlayer,
    argument,
    tally,
  };
};

export type UpvoteResult = {
  ok: boolean;
  message: string;
  argument?: Argument;
  player: PlayerState;
  tally: Tally;
};

export const upvoteArgument = async (
  username: string,
  argumentId: string
): Promise<UpvoteResult> => {
  const prompt = await getPrompt();
  const date = prompt.date;
  const player = await readPlayer(date, username);
  const args = await readAllArgs(date);
  const target = await readArg(date, argumentId);

  if (!target) {
    const { tally } = computeTally(args, prompt);
    return {
      ok: false,
      message: 'That argument is gone.',
      player,
      tally,
    };
  }
  if (target.author === username) {
    const { tally } = computeTally(args, prompt);
    return {
      ok: false,
      message: 'Can’t upvote your own argument.',
      player,
      tally,
    };
  }
  if (player.upvotedArgIds.includes(argumentId)) {
    const { tally } = computeTally(args, prompt);
    return {
      ok: false,
      message: 'You already upvoted that one.',
      player,
      tally,
    };
  }

  target.upvotes += 1;
  await writeArg(date, target);

  const newPlayer: PlayerState = {
    ...player,
    upvotedArgIds: [...player.upvotedArgIds, argumentId],
  };
  await writePlayer(date, username, newPlayer);

  // Replace in args list for an up-to-date tally.
  const updatedArgs = args.map((a) => (a.id === argumentId ? target : a));
  const { tally } = computeTally(updatedArgs, prompt);
  return {
    ok: true,
    message: 'Pulled harder.',
    argument: target,
    player: newPlayer,
    tally,
  };
};
