import { reddit } from '@devvit/web/server';
import { dayKey } from '../../shared/dateUtil';

export const createPost = async () => {
  return await reddit.submitCustomPost({
    title: `🪢 Take Sides — ${dayKey()}`,
  });
};
