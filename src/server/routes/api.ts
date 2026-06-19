import { Hono, type Context } from 'hono';
import { context, reddit } from '@devvit/web/server';
import type {
  BuryRequest,
  BuryResponse,
  DigRequest,
  DigResponse,
  ErrorResponse,
  InitGameResponse,
  LeaderboardResponse,
} from '../../shared/api';
import { dayKey } from '../../shared/dateUtil';
import { doBury, doDig, getLeaderboard, initToday } from '../core/game';

export const api = new Hono();

const missingPost = (c: Context) =>
  c.json<ErrorResponse>(
    { status: 'error', message: 'postId missing from context' },
    400
  );

api.get('/init', async (c) => {
  if (!context.postId) return missingPost(c);

  try {
    const username = (await reddit.getCurrentUsername()) ?? 'anonymous';
    const [{ date, treasureCount, player }, leaderboard] = await Promise.all([
      initToday(username),
      getLeaderboard(dayKey()),
    ]);
    return c.json<InitGameResponse>({
      type: 'init',
      date,
      username,
      treasureCount,
      player,
      leaderboard,
    });
  } catch (err) {
    console.error('init error', err);
    return c.json<ErrorResponse>(
      { status: 'error', message: 'init failed' },
      500
    );
  }
});

api.post('/dig', async (c) => {
  if (!context.postId) return missingPost(c);

  try {
    const body = await c.req.json<DigRequest>();
    if (
      !body ||
      typeof body.pos?.x !== 'number' ||
      typeof body.pos?.y !== 'number'
    ) {
      return c.json<ErrorResponse>(
        { status: 'error', message: 'pos.x and pos.y required' },
        400
      );
    }
    const username = (await reddit.getCurrentUsername()) ?? 'anonymous';
    const result = await doDig(username, body.pos);
    return c.json<DigResponse>(result);
  } catch (err) {
    console.error('dig error', err);
    return c.json<ErrorResponse>(
      { status: 'error', message: 'dig failed' },
      500
    );
  }
});

api.post('/bury', async (c) => {
  if (!context.postId) return missingPost(c);

  try {
    const body = await c.req.json<BuryRequest>();
    if (
      !body ||
      typeof body.pos?.x !== 'number' ||
      typeof body.pos?.y !== 'number' ||
      typeof body.clue !== 'string'
    ) {
      return c.json<ErrorResponse>(
        { status: 'error', message: 'pos and clue required' },
        400
      );
    }
    const username = (await reddit.getCurrentUsername()) ?? 'anonymous';
    const result = await doBury(username, body.pos, body.clue);
    return c.json<BuryResponse>({
      type: 'bury',
      ok: result.ok,
      message: result.message,
      player: result.player,
    });
  } catch (err) {
    console.error('bury error', err);
    return c.json<ErrorResponse>(
      { status: 'error', message: 'bury failed' },
      500
    );
  }
});

api.get('/leaderboard', async (c) => {
  if (!context.postId) return missingPost(c);

  try {
    const date = dayKey();
    const entries = await getLeaderboard(date);
    return c.json<LeaderboardResponse>({
      type: 'leaderboard',
      date,
      entries,
    });
  } catch (err) {
    console.error('leaderboard error', err);
    return c.json<ErrorResponse>(
      { status: 'error', message: 'leaderboard failed' },
      500
    );
  }
});
