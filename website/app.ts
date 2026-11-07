import { initializeWalkthrough } from './walkthrough.js';
import './walkthrough.css';

initializeWalkthrough();

const demo = document.querySelector<HTMLIFrameElement>('#reader-demo');
const disclosure = document.querySelector<HTMLDetailsElement>('#try-reader');
const readerPanel = document.getElementById('demo-reader-panel');
const homePanel = document.getElementById('demo-home-panel');
const reset = document.querySelector<HTMLButtonElement>('#reset-demo');

function showHostView(view: string | undefined) {
  if (!readerPanel || !homePanel) return;
  const isReader = view === 'reader';
  readerPanel.hidden = !isReader;
  homePanel.hidden = isReader;
  for (const button of document.querySelectorAll<HTMLElement>(
    '[data-host-nav]',
  )) {
    const active = button.dataset.hostView === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  const status = document.getElementById('host-status');
  if (status)
    status.textContent = isReader ? '已切换到阅读器' : '已切换到首页示例对话';
}

for (const button of document.querySelectorAll<HTMLElement>(
  '[data-host-view]',
)) {
  button.addEventListener('click', () => showHostView(button.dataset.hostView));
}

disclosure?.addEventListener('toggle', () => {
  const label = disclosure.querySelector('.try-action');
  if (label)
    label.textContent = disclosure.open ? '收起阅读器 −' : '展开阅读器 ＋';
  if (
    disclosure.open &&
    demo &&
    !demo.hasAttribute('src') &&
    demo.dataset.src
  ) {
    demo.src = demo.dataset.src;
  }
  if (!disclosure.open)
    demo?.contentWindow?.postMessage(
      { type: 'reader-demo:flush' },
      location.origin,
    );
});

reset?.addEventListener('click', () => {
  demo?.contentWindow?.postMessage(
    { type: 'reader-demo:reset' },
    location.origin,
  );
  showHostView('reader');
});
