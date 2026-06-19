// Day boundaries are computed in UTC so every player worldwide is on the same
// daily round.
export const dayKey = (d: Date = new Date()): string =>
  d.toISOString().slice(0, 10);

export const tomorrowKey = (d: Date = new Date()): string => {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
};
