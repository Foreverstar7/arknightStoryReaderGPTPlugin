import { initializeWalkthrough } from './walkthrough.js';
import './walkthrough.css';
import { searchResultSchema } from '../src/shared/search.js';

initializeWalkthrough();

const demo = document.querySelector<HTMLIFrameElement>('#reader-demo');
const disclosure = document.querySelector<HTMLDetailsElement>('#try-reader');
const readerPanel = document.getElementById('demo-reader-panel');
const homePanel = document.getElementById('demo-home-panel');
const chatScroll = homePanel?.querySelector<HTMLElement>('.chat-scroll');
const reset = document.querySelector<HTMLButtonElement>('#reset-demo');

function scrollChatToLatest() {
  chatScroll?.scrollTo({ top: chatScroll.scrollHeight, behavior: 'instant' });
}

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
  searchTurns.clear();
  pendingStory = undefined;
  messageStream
    ?.querySelectorAll('[data-search-message]')
    .forEach((node) => node.remove());
  if (searchHint) searchHint.hidden = false;
  if (searchInput) searchInput.value = '帮我找一下《孤星》';
  demo?.contentWindow?.postMessage(
    { type: 'reader-demo:reset' },
    location.origin,
  );
  showHostView('reader');
});

const searchForm = document.querySelector<HTMLFormElement>('#demo-search-form');
const searchInput =
  document.querySelector<HTMLInputElement>('#demo-search-input');
const messageStream = document.getElementById('demo-chat-messages');
const searchHint = document.getElementById('demo-search-hint');
let requestId = 0;
type SearchRequest = {
  type: 'reader-demo:search';
  requestId: number;
  input: { queries: string[]; by: 'story' };
};
type SearchTurn = {
  status: HTMLParagraphElement;
  cards: HTMLDivElement;
  request?: SearchRequest;
};
const searchTurns = new Map<number, SearchTurn>();
let pendingStory: string | undefined;

function appendSearchTurn(value: string): SearchTurn | undefined {
  if (!messageStream) return;
  document.getElementById('demo-search-status')?.removeAttribute('id');
  document.getElementById('demo-search-cards')?.removeAttribute('id');
  if (searchHint) searchHint.hidden = true;
  const user = document.createElement('div');
  user.className = 'chat-message user';
  user.dataset.searchMessage = 'user';
  const userRole = document.createElement('span');
  userRole.className = 'sr-only';
  userRole.textContent = '你：';
  const query = document.createElement('p');
  query.textContent = value;
  user.append(userRole, query);
  const assistant = document.createElement('div');
  assistant.className = 'chat-message assistant';
  assistant.dataset.searchMessage = 'assistant';
  const role = document.createElement('p');
  role.className = 'chat-role';
  role.textContent = 'ChatGPT';
  const status = document.createElement('p');
  status.id = 'demo-search-status';
  status.className = 'small muted';
  status.setAttribute('role', 'status');
  const cards = document.createElement('div');
  cards.id = 'demo-search-cards';
  assistant.append(role, status, cards);
  messageStream.append(user, assistant);
  return { status, cards };
}
demo?.addEventListener('load', () => {
  for (const turn of searchTurns.values())
    if (turn.request)
      demo.contentWindow?.postMessage(turn.request, location.origin);
  if (pendingStory)
    demo.contentWindow?.postMessage(
      { type: 'reader-demo:open-story', storyId: pendingStory },
      location.origin,
    );
});
searchForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = searchInput?.value.trim() ?? '';
  if (!value) return;
  const turn = appendSearchTurn(value);
  if (!turn) return;
  if (searchInput) searchInput.value = '';
  if (!['孤星', '帮我找一下《孤星》', '我想阅读《孤星》'].includes(value)) {
    turn.status.textContent = '此演示支持预设输入“帮我找一下《孤星》”。';
    scrollChatToLatest();
    return;
  }
  pendingStory = undefined;
  turn.request = {
    type: 'reader-demo:search',
    requestId: ++requestId,
    input: { by: 'story', queries: ['孤星'] },
  };
  searchTurns.set(requestId, turn);
  turn.status.textContent = '正在查找演示剧情…';
  scrollChatToLatest();
  demo?.contentWindow?.postMessage(turn.request, location.origin);
});
window.addEventListener('message', (event) => {
  if (
    event.origin !== location.origin ||
    event.source !== demo?.contentWindow ||
    typeof event.data?.requestId !== 'number'
  )
    return;
  const turn = searchTurns.get(event.data.requestId);
  if (!turn) return;
  if (event.data?.type === 'reader-demo:search-error') {
    delete turn.request;
    turn.status.textContent = '示例搜索失败，请重新提交。';
    scrollChatToLatest();
    return;
  }
  if (event.data?.type !== 'reader-demo:search-result') return;
  const parsed = searchResultSchema.safeParse(event.data.result);
  if (!parsed.success) return;
  delete turn.request;
  turn.cards.replaceChildren();
  turn.status.textContent = parsed.data.total
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
    turn.cards.append(article);
    button.addEventListener('click', () => {
      pendingStory = card.id;
      demo?.contentWindow?.postMessage(
        { type: 'reader-demo:open-story', storyId: card.id },
        location.origin,
      );
      showHostView('reader');
    });
  }
  scrollChatToLatest();
});
