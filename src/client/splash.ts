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
    'Pick a side. Write one line. Upvotes on arguments pull the rope toward that side. End of day: one side wins.'
  );
});

function init() {
  const user = context.username;
  if (user) {
    titleEl.textContent = `Hey ${user} 👋`;
    descEl.textContent =
      'Take a side. Write one line. Upvotes pull the rope. Daily.';
  }
}

init();
