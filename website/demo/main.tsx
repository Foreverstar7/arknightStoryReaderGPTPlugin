import { createRoot } from 'react-dom/client';
import { ReaderApp } from '../../src/ui/ReaderApp.js';
import { CoverImagesProvider } from '../../src/ui/cover-images.js';
import { BrowserDemoTransport, DEMO_STORAGE_KEY } from './browser-transport.js';
import '../../src/ui/styles.css';
import './styles.css';
import { searchInputSchema } from '../../src/shared/search.js';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('原创样例缺少根节点。');
const container = rootElement;
const root = createRoot(container);
let flush: () => Promise<void> = async () => undefined;
let generation = 0;
let initialStoryId: string | undefined;
let currentTransport: BrowserDemoTransport | undefined;
function failure(error: unknown) {
  root.render(
    <main className="startup">
      <div role="alert">
        {error instanceof Error ? error.message : '原创样例打开失败。'}
      </div>
      <button onClick={() => void start()}>重试</button>
      <button onClick={() => void reset()}>重置样例记录</button>
    </main>,
  );
}
async function start() {
  try {
    const transport = await BrowserDemoTransport.create(sessionStorage);
    currentTransport = transport;
    root.render(
      <CoverImagesProvider key={++generation}>
        <ReaderApp
          transport={transport}
          environment="网站占位样例 · 独立会话记录 · 不连接插件或 PRTS"
          resumeOnStart={false}
          initialStoryId={initialStoryId}
          onFlushReady={(value) => {
            flush = value;
          }}
        />
      </CoverImagesProvider>,
    );
  } catch (error) {
    failure(error);
  }
}
async function reset() {
  try {
    // Reset explicitly discards demo records. A quota/permission error on the
    // last save must not prevent removing the broken sample state.
    await flush().catch(() => undefined);
    root.render(null);
    sessionStorage.removeItem(DEMO_STORAGE_KEY);
    initialStoryId = undefined;
    await start();
  } catch (error) {
    failure(error);
  }
}
window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.source !== window.parent)
    return;
  if (event.data?.type === 'reader-demo:reset') void reset();
  if (event.data?.type === 'reader-demo:flush') void flush();
  if (
    event.data?.type === 'reader-demo:open-story' &&
    event.data.storyId === 'fixture-mist'
  ) {
    void flush()
      .then(async () => {
        initialStoryId = 'fixture-mist';
        await start();
      })
      .catch(failure);
  }
  if (event.data?.type === 'reader-demo:search') {
    const input = searchInputSchema.safeParse(event.data.input);
    const requestId: unknown = event.data.requestId;
    if (!input.success || typeof requestId !== 'number' || !currentTransport)
      return;
    void currentTransport
      .call('reader_search', input.data)
      .then((result) =>
        window.parent.postMessage(
          { type: 'reader-demo:search-result', requestId, result },
          location.origin,
        ),
      )
      .catch(() =>
        window.parent.postMessage(
          { type: 'reader-demo:search-error', requestId },
          location.origin,
        ),
      );
  }
});
window.addEventListener('pagehide', () => {
  void flush();
});
void start();
