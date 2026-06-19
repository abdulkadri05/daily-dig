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
} from '../../shared/api';
import { dayKey } from '../../shared/dateUtil';
import { pickPrompt } from '../../shared/prompts';

// ---------- Redis keys ----------
const kArgs = (date: string) => `ts:args:${date}`; // hash argId -> JSON
const kPlayer = (date: string, user: string) => `ts:player:${date}:${user}`;
const kPromptCache = (date: string) => `ts:prompt:${date}`;

// ---------- Helpers ----------
const newId = (): string => Math.random().toString(36).slice(2, 10);

const sanitizeText = (raw: string): string => {
  const s = (raw ?? '').toString().trim().replace(/\s+/g, ' ');
  return s.slice(0, MAX_ARG_LENGTH);
};

const validSide = (s: unknown): s is Side => s === 'left' || s === 'right';

// ---------- Prompt ----------
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
  const seed = pickPrompt(date);
  const prompt: DailyPrompt = {
    date,
    question: seed.question,
    leftLabel: seed.leftLabel,
    rightLabel: seed.rightLabel,
  };
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
});

const readPlayer = async (
  date: string,
  user: string
): Promise<PlayerState> => {
  const raw = await redis.get(kPlayer(date, user));
  if (!raw) return blankPlayer();
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

// ---------- Public ops ----------
export const initState = async (
  username: string
): Promise<{
  prompt: DailyPrompt;
  tally: Tally;
  args: Argument[];
  player: PlayerState;
}> => {
  const prompt = await getPrompt();
  const [args, player] = await Promise.all([
    readAllArgs(prompt.date),
    readPlayer(prompt.date, username),
  ]);
  const { tally, argsSorted } = computeTally(args, prompt);
  return {
    prompt,
    tally,
    args: argsSorted.slice(0, TOP_ARGUMENTS),
    player,
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

  const newPlayer: PlayerState = {
    hasSubmitted: true,
    side: rawSide,
    argumentId: argument.id,
    upvotedArgIds: player.upvotedArgIds,
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
