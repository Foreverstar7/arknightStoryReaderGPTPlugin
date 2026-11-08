import { initializeWalkthrough } from './walkthrough.js';
import './walkthrough.css';
import { searchResultSchema } from '../src/shared/search.js';

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
  ++requestId;
  pendingSearch = undefined;
  pendingStory = undefined;
  searchCards?.replaceChildren();
  if (searchStatus)
    searchStatus.textContent = '占位演示 · 非原作剧情。可重新提交预设搜索。';
  demo?.contentWindow?.postMessage(
    { type: 'reader-demo:reset' },
    location.origin,
  );
  showHostView('reader');
});

const searchForm = document.querySelector<HTMLFormElement>('#demo-search-form');
const searchInput =
  document.querySelector<HTMLInputElement>('#demo-search-input');
const searchStatus = document.getElementById('demo-search-status');
const searchCards = document.getElementById('demo-search-cards');
let requestId = 0;
let pendingSearch:
  | {
      type: string;
      requestId: number;
      input: { queries: string[]; by: 'story' };
    }
  | undefined;
let pendingStory: string | undefined;
demo?.addEventListener('load', () => {
  if (pendingSearch)
    demo.contentWindow?.postMessage(pendingSearch, location.origin);
  if (pendingStory)
    demo.contentWindow?.postMessage(
      { type: 'reader-demo:open-story', storyId: pendingStory },
      location.origin,
    );
});
searchForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = searchInput?.value.trim() ?? '';
  if (!['孤星', '帮我找一下《孤星》', '我想阅读《孤星》'].includes(value)) {
    if (searchStatus)
      searchStatus.textContent = '此演示支持预设输入“帮我找一下《孤星》”。';
    return;
  }
  pendingStory = undefined;
  pendingSearch = {
    type: 'reader-demo:search',
    requestId: ++requestId,
    input: { by: 'story', queries: ['孤星'] },
  };
  if (searchStatus) searchStatus.textContent = '正在查找演示剧情…';
  searchCards?.replaceChildren();
  demo?.contentWindow?.postMessage(pendingSearch, location.origin);
});
window.addEventListener('message', (event) => {
  if (
    event.origin !== location.origin ||
    event.source !== demo?.contentWindow ||
    event.data?.requestId !== requestId
  )
    return;
  if (event.data?.type === 'reader-demo:search-error') {
    if (searchStatus) searchStatus.textContent = '示例搜索失败，请重新提交。';
    return;
  }
  if (event.data?.type !== 'reader-demo:search-result') return;
  const parsed = searchResultSchema.safeParse(event.data.result);
  if (!parsed.success || !searchCards) return;
  pendingSearch = undefined;
  searchCards.replaceChildren();
  if (searchStatus)
    searchStatus.textContent = parsed.data.total
      ? '找到《孤星》了，点击卡片查看篇章目录。'
      : '当前样例未找到匹配剧情。';
  for (const card of parsed.data.results) {
    if (card.id !== 'fixture-mist') continue;
    const article = document.createElement('article');
    article.className = 'demo-result-card';
    const image = document.createElement('img');
    image.src = new URL('./assets/cover-lone-trail.webp', import.meta.url).href;
    image.alt = '孤星 · 原创线描意象示例封面';
    image.width = 1000;
    image.height = 563;
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', `查看《${card.title}》篇章目录`);
    const type = document.createElement('span');
    type.className = 'small muted';
    type.textContent = `${card.type} · 占位演示`;
    const title = document.createElement('strong');
    title.textContent = card.title;
    const action = document.createElement('span');
    action.textContent = '查看篇章目录 →';
    button.append(type, title, action);
    article.append(image, button);
    searchCards.append(article);
    button.addEventListener('click', () => {
      pendingStory = card.id;
      demo?.contentWindow?.postMessage(
        { type: 'reader-demo:open-story', storyId: card.id },
        location.origin,
      );
      showHostView('reader');
    });
  }
  homePanel?.scrollTo({ top: homePanel.scrollHeight, behavior: 'instant' });
});
