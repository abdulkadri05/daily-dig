// Daily prompt rotation. Curated to be fun-divisive, not political/religious/
// hateful. The game picks one prompt per day by hashing the UTC date into the
// pool, so every subreddit running the app sees the same daily prompt.

export type PromptSeed = {
  question: string;
  leftLabel: string;
  rightLabel: string;
};

export const PROMPTS: ReadonlyArray<PromptSeed> = [
  { question: 'Cereal is a soup.', leftLabel: 'Soup', rightLabel: 'Not soup' },
  { question: 'A hot dog is a sandwich.', leftLabel: 'Sandwich', rightLabel: 'Not a sandwich' },
  {
    question: '100 duck-sized horses or 1 horse-sized duck — which would you rather fight?',
    leftLabel: '100 tiny horses',
    rightLabel: '1 giant duck',
  },
  { question: 'Pineapple belongs on pizza.', leftLabel: 'Belongs', rightLabel: 'Crime' },
  { question: 'GIF is pronounced with a hard G.', leftLabel: 'Hard G', rightLabel: 'Soft G' },
  { question: 'Milk goes in the bowl before the cereal.', leftLabel: 'Milk first', rightLabel: 'Cereal first' },
  { question: 'Toilet paper should hang over, not under.', leftLabel: 'Over', rightLabel: 'Under' },
  { question: 'Socks in bed: acceptable?', leftLabel: 'Acceptable', rightLabel: 'Unhinged' },
  { question: 'Beans belong on toast.', leftLabel: 'On toast', rightLabel: 'Off toast' },
  { question: 'Tomatoes are a fruit.', leftLabel: 'Fruit', rightLabel: 'Vegetable' },
  { question: 'Pluto is a planet.', leftLabel: 'Planet', rightLabel: 'Rock' },
  { question: 'Cats > dogs.', leftLabel: 'Cats', rightLabel: 'Dogs' },
  { question: 'Cake or pie?', leftLabel: 'Cake', rightLabel: 'Pie' },
  { question: 'Pancakes or waffles?', leftLabel: 'Pancakes', rightLabel: 'Waffles' },
  { question: 'Tea or coffee?', leftLabel: 'Tea', rightLabel: 'Coffee' },
  { question: 'Window seat or aisle seat?', leftLabel: 'Window', rightLabel: 'Aisle' },
  { question: 'Early bird or night owl?', leftLabel: 'Early bird', rightLabel: 'Night owl' },
  { question: 'Tabs or spaces?', leftLabel: 'Tabs', rightLabel: 'Spaces' },
  { question: 'Books or movies?', leftLabel: 'Books', rightLabel: 'Movies' },
  { question: 'Sweet breakfast or savory breakfast?', leftLabel: 'Sweet', rightLabel: 'Savory' },
  { question: 'Beach vacation or mountain vacation?', leftLabel: 'Beach', rightLabel: 'Mountains' },
  { question: 'Texting back same day is mandatory.', leftLabel: 'Mandatory', rightLabel: 'Optional' },
  { question: 'Time travel: see the future or change the past?', leftLabel: 'See future', rightLabel: 'Change past' },
  { question: 'Always be 30 minutes early or always be 5 minutes late?', leftLabel: 'Always early', rightLabel: 'Always late' },
  { question: 'Invisibility or flight?', leftLabel: 'Invisibility', rightLabel: 'Flight' },
  { question: 'Star Wars or Star Trek?', leftLabel: 'Star Wars', rightLabel: 'Star Trek' },
  { question: 'Sit-down board games or party games?', leftLabel: 'Sit-down', rightLabel: 'Party games' },
  { question: 'Ranch goes on pizza.', leftLabel: 'Yes', rightLabel: 'Absolutely not' },
  { question: 'A bird is a dinosaur.', leftLabel: 'Dinosaur', rightLabel: 'Bird' },
  { question: 'Plain water on cereal in an emergency: acceptable?', leftLabel: 'Acceptable', rightLabel: 'Never' },
];

// Pick today's prompt deterministically from the UTC date so all viewers see
// the same one, no matter who loads first.
export const pickPrompt = (dateKey: string): PromptSeed => {
  // Simple hash of YYYY-MM-DD → integer.
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) {
    h = ((h << 5) - h + dateKey.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % PROMPTS.length;
  return PROMPTS[idx]!;
};
