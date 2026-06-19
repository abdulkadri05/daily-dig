import { Hono, type Context } from 'hono';
import { context, reddit } from '@devvit/web/server';
import type {
  ErrorResponse,
  InitResponse,
  SubmitRequest,
  SubmitResponse,
  UpvoteRequest,
  UpvoteResponse,
} from '../../shared/api';
import { initState, submitArgument, upvoteArgument } from '../core/sides';

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
    const { prompt, tally, args, player } = await initState(username);
    return c.json<InitResponse>({
      type: 'init',
      username,
      prompt,
      tally,
      args,
      player,
    });
  } catch (err) {
    console.error('init error', err);
    return c.json<ErrorResponse>(
      { status: 'error', message: 'init failed' },
      500
    );
  }
});

api.post('/submit', async (c) => {
  if (!context.postId) return missingPost(c);
  try {
    const body = await c.req.json<SubmitRequest>();
    const username = (await reddit.getCurrentUsername()) ?? 'anonymous';
    const result = await submitArgument(username, body?.side, body?.text);
    return c.json<SubmitResponse>({
      type: 'submit',
      ok: result.ok,
      message: result.message,
      player: result.player,
      ...(result.argument ? { argument: result.argument } : {}),
      tally: result.tally,
    });
  } catch (err) {
    console.error('submit error', err);
    return c.json<ErrorResponse>(
      { status: 'error', message: 'submit failed' },
      500
    );
  }
});

api.post('/upvote', async (c) => {
  if (!context.postId) return missingPost(c);
  try {
    const body = await c.req.json<UpvoteRequest>();
    if (!body?.argumentId) {
      return c.json<ErrorResponse>(
        { status: 'error', message: 'argumentId required' },
        400
      );
    }
    const username = (await reddit.getCurrentUsername()) ?? 'anonymous';
    const result = await upvoteArgument(username, body.argumentId);
    return c.json<UpvoteResponse>({
      type: 'upvote',
      ok: result.ok,
      message: result.message,
      ...(result.argument ? { argument: result.argument } : {}),
      player: result.player,
      tally: result.tally,
    });
  } catch (err) {
    console.error('upvote error', err);
    return c.json<ErrorResponse>(
      { status: 'error', message: 'upvote failed' },
      500
    );
  }
});

// /init also acts as the tally refresh endpoint.
api.get('/refresh', async (c) => {
  if (!context.postId) return missingPost(c);
  try {
    const username = (await reddit.getCurrentUsername()) ?? 'anonymous';
    const { prompt, tally, args, player } = await initState(username);
    return c.json<InitResponse>({
      type: 'init',
      username,
      prompt,
      tally,
      args,
      player,
    });
  } catch (err) {
    console.error('refresh error', err);
    return c.json<ErrorResponse>(
      { status: 'error', message: 'refresh failed' },
      500
    );
  }
});
