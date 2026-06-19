import { context, requestExpandedMode, showToast } from '@devvit/web/client';

const startButton = document.getElementById('start-button') as HTMLButtonElement;
const rulesLink = document.getElementById('rules-link') as HTMLDivElement;
const titleEl = document.getElementById('title') as HTMLHeadingElement;
const descEl = document.getElementById('description') as HTMLParagraphElement;

startButton.addEventListener('click', (e) => {
  requestExpandedMode(e, 'game');
});

rulesLink.addEventListener('click', () => {
  showToast(
    'Tap the island to dig. Closer taps make warmer ripples. Find chests, then bury one for tomorrow.'
  );
});

function init() {
  const user = context.username;
  if (user) {
    titleEl.textContent = `Hey ${user} 👋`;
    descEl.textContent =
      'Hunt for chests other Redditors buried yesterday. Bury one for tomorrow.';
  }
}

init();
